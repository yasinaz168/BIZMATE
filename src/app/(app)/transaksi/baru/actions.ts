"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logDbError } from "@/lib/server-log";
import {
  isSameManualPayload,
  validateManualTransaction,
  type ManualPayloadComparable,
} from "@/lib/transactions/manual-validate";

/**
 * =====================================================================
 * SERVER ACTION — Buat Transaksi Manual (Tahap P5.4.4 + idempotency R2.2).
 * =====================================================================
 * Alur (pola sama dengan kasir/actions.ts P5.2):
 * 1. supabase.auth.getUser() — sesi divalidasi ke Supabase.
 * 2. resolveBusiness: businesses.owner_id = user.id — business_id TIDAK
 *    PERNAH berasal dari browser/FormData.
 * 3. Validasi ulang SEMUA input di server (manual-validate) — termasuk
 *    request_id (dibuat KLIEN, server tidak membuat) — total dihitung
 *    server; source = "manual", status = "completed" diputuskan server.
 * 4. INSERT hanya field yang diperlukan; request_id ikut disimpan untuk
 *    idempotency memakai unique partial index
 *    transactions_business_request_uidx (business_id, request_id)
 *    WHERE request_id IS NOT NULL (migration 00005 §4).
 *
 * IDEMPOTENCY (R2.2) — semantik identik dengan RPC POS (create_sale),
 * tanpa RPC baru dan tanpa perubahan database:
 * - INSERT biasa (bukan upsert): mekanisme ON CONFLICT target PostgREST
 *   TIDAK mendukung unique index PARTIAL secara aman (bisa error 42P10),
 *   sehingga konflik ditangani via SQLSTATE 23505 lalu read-back —
 *   deterministik untuk semua bentuk unique index.
 * - Konflik (23505) → baca baris lama (business_id + request_id):
 *   · payload IDENTIK  → replay: sukses dengan transactionId LAMA,
 *     replay = true, TANPA baris baru, TANPA revalidatePath (pola POS),
 *     TANPA mengubah transaksi lama sedikit pun.
 *   · payload BERBEDA  → DITOLAK dengan pesan aman — tidak membuat baris
 *     baru dan tidak menyentuh baris lama.
 * - Error database → logDbError (hanya code/message), pengguna melihat
 *   pesan aman.
 *
 * GRANT: SELECT/INSERT/UPDATE/DELETE transactions untuk authenticated
 * sudah terverifikasi live (00006). TANPA service_role. Stok produk
 * TIDAK diubah oleh transaksi manual.
 */

export type ManualActionState =
  | { ok: true; transactionId: string; replay: boolean }
  | { ok: false; error: string; fieldErrors?: string[] }
  | null;

type ServerClient = Awaited<ReturnType<typeof createClient>>;

/** Kegagalan query bisnis — TANPA detail database */
const BUSINESS_DB_ERROR = "Gagal memuat data bisnis. Silakan coba lagi.";
/** Bisnis memang belum dimiliki pengguna */
const NO_BUSINESS_ERROR = "Profil bisnis belum ada. Lengkapi data bisnis terlebih dahulu.";
/** Kegagalan INSERT yang tidak dapat diidentifikasi aman */
const INSERT_DB_ERROR = "Gagal menyimpan transaksi. Silakan coba lagi.";
/** Kegagalan read-back idempotency (konflik sudah terjadi, verifikasi gagal) */
const IDEMPOTENCY_VERIFY_ERROR =
  "Gagal memverifikasi percobaan sebelumnya. Silakan coba lagi.";
/**
 * request_id sama dengan payload BERBEDA — pesan aman & stabil
 * (tidak memuat detail internal).
 */
const REPLAY_MISMATCH_ERROR =
  "Permintaan ini sudah pernah diproses dengan data yang berbeda. Periksa kembali isian formulir.";

/** Kolom untuk read-back pembandingan payload (idempotency) */
const READBACK_COLUMNS =
  "id, source, type, title, quantity, unit_price, total, transacted_at, payment_method, notes";

type BusinessLookup =
  | { status: "found"; businessId: string }
  | { status: "no_business" }
  | { status: "db_error" };

async function resolveBusinessId(
  supabase: ServerClient,
  userId: string
): Promise<BusinessLookup> {
  const { data: business, error } = await supabase
    .from("businesses")
    .select("id")
    .eq("owner_id", userId)
    .maybeSingle();

  if (error) {
    logDbError(
      {
        route: "transaksi/baru/actions",
        table: "businesses",
        op: "select",
        step: "lookup bisnis",
      },
      error
    );
    return { status: "db_error" };
  }

  if (!business) {
    return { status: "no_business" };
  }
  return { status: "found", businessId: business.id };
}

/** Nilai FormData aman → string (File → ""); tidak pernah lepas ke DB. */
function formText(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

/** Unique violation (SQLSTATE 23505) — disamakan ke bentuk error PostgREST. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "23505"
  );
}

/** ISO kanonik dari nilai timestamptz DB (untuk pembandingan string aman). */
function toCanonicalIso(value: unknown): string {
  const date = new Date(String(value ?? ""));
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

/**
 * Petakan baris DB lama → bentuk pembanding payload (isSameManualPayload).
 * Semua nilai sudah berada di database; angka dikonversi Number()
 * (desimal-safe) — pembanding melakukan round2 tersendiri.
 */
function rowToPayload(row: Record<string, unknown>): ManualPayloadComparable {
  const payment = row.payment_method;
  return {
    type: row.type === "expense" ? "expense" : "income",
    title: typeof row.title === "string" ? row.title : "",
    quantity: Number(row.quantity ?? 0),
    unitPrice: Number(row.unit_price ?? 0),
    total: Number(row.total ?? 0),
    transactedAtIso: toCanonicalIso(row.transacted_at),
    paymentMethod:
      payment === "cash" || payment === "transfer" || payment === "qris" || payment === "ewallet"
        ? payment
        : null,
    notes: typeof row.notes === "string" ? row.notes : null,
  };
}

/**
 * Buat transaksi manual (pemasukan/pengeluaran) — idempotent per request_id.
 * business_id dari SERVER; total dihitung SERVER; source & status
 * diputuskan SERVER — hanya di sini, tidak pernah dari browser.
 */
export async function createManualTransactionAction(
  _prevState: ManualActionState,
  formData: FormData
): Promise<ManualActionState> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Sesi berakhir. Silakan login ulang." };
  }

  const lookup = await resolveBusinessId(supabase, user.id);
  if (lookup.status === "db_error") {
    return { ok: false, error: BUSINESS_DB_ERROR };
  }
  if (lookup.status === "no_business") {
    return { ok: false, error: NO_BUSINESS_ERROR };
  }

  // Validasi ulang SELURUH input di server — browser tidak dipercaya.
  // request_id dibuat oleh klien (server TIDAK membuat) — kunci idempotency.
  const validation = validateManualTransaction({
    // Kolom yang wajib diisi pengguna:
    type: formText(formData, "type"),
    title: formText(formData, "title"),
    quantity: formText(formData, "quantity"),
    unitPrice: formText(formData, "unit_price"),
    paymentMethod: formText(formData, "payment_method"),
    transactedAt: formText(formData, "transacted_at"),
    notes: formText(formData, "notes"),
    requestId: formText(formData, "request_id"),
  });

  if (!validation.valid || !validation.data) {
    return {
      ok: false,
      error: "Data transaksi belum valid. Periksa kembali isian formulir.",
      fieldErrors: validation.errors,
    };
  }
  const record = validation.data;

  // Insert TANPA field milik klien: business_id dari lookup server;
  // source dikunci "manual"; status dikunci "completed"; total dari server;
  // request_id = kunci idempotency dari klien (bukan rahasia, hanya kunci).
  const { data: inserted, error: insertError } = await supabase
    .from("transactions")
    .insert({
      business_id: lookup.businessId,
      type: record.type,
      title: record.title,
      quantity: record.quantity,
      unit_price: record.unitPrice,
      total: record.total,
      transacted_at: record.transactedAtIso,
      payment_method: record.paymentMethod,
      source: "manual",
      status: "completed",
      notes: record.notes === "" ? null : record.notes,
      request_id: record.requestId,
    })
    .select("id")
    .single();

  /* ---------- konflik request_id (23505) → read-back idempotency ---------- */
  if (insertError) {
    if (!isUniqueViolation(insertError)) {
      logDbError(
        {
          route: "transaksi/baru/actions",
          table: "transactions",
          op: "insert",
          step: "transaksi manual",
        },
        insertError
      );
      return { ok: false, error: INSERT_DB_ERROR };
    }

    // request_id sudah pernah dipakai pada bisnis ini → ambil baris lama.
    // TANPA mengubah/menimpa baris lama (append-only).
    const { data: existing, error: readError } = await supabase
      .from("transactions")
      .select(READBACK_COLUMNS)
      .eq("business_id", lookup.businessId)
      .eq("request_id", record.requestId)
      .maybeSingle();

    if (readError || !existing) {
      logDbError(
        {
          route: "transaksi/baru/actions",
          table: "transactions",
          op: "select",
          step: "read-back idempotency",
        },
        readError
      );
      return { ok: false, error: IDEMPOTENCY_VERIFY_ERROR };
    }

    const oldRow = existing as Record<string, unknown>;

    // Baris dengan request_id sama ternyata bukan milik alur manual →
    // perlakukan sebagai payload berbeda (jangan campurkan jalur).
    if (oldRow.source !== "manual") {
      return { ok: false, error: REPLAY_MISMATCH_ERROR };
    }

    const stored = rowToPayload(oldRow);
    const incoming: ManualPayloadComparable = {
      type: record.type,
      title: record.title,
      quantity: record.quantity,
      unitPrice: record.unitPrice,
      total: record.total,
      transactedAtIso: record.transactedAtIso,
      paymentMethod: record.paymentMethod,
      notes: record.notes === "" ? null : record.notes,
    };

    if (!isSameManualPayload(stored, incoming)) {
      // request_id sama, data BERBEDA → tolak (jangan buat baris baru)
      return { ok: false, error: REPLAY_MISMATCH_ERROR };
    }

    // Replay: kembalikan transaksi lama, TANPA baris baru & TANPA
    // revalidatePath — persis pola POS (kasir/actions.ts saat replay).
    return {
      ok: true,
      transactionId: String(oldRow.id ?? ""),
      replay: true,
    };
  }

  if (!inserted) {
    logDbError(
      {
        route: "transaksi/baru/actions",
        table: "transactions",
        op: "insert",
        step: "id transaksi hilang",
      },
      null
    );
    return { ok: false, error: INSERT_DB_ERROR };
  }

  const keys = Object.keys(inserted as Record<string, unknown>);
  const transactionId =
    keys.length > 0 ? String((inserted as Record<string, unknown>).id ?? "") : "";
  if (!transactionId) {
    logDbError(
      {
        route: "transaksi/baru/actions",
        table: "transactions",
        op: "insert",
        step: "id transaksi hilang",
      },
      null
    );
    return { ok: false, error: INSERT_DB_ERROR };
  }

  revalidatePath("/transaksi"); // daftar transaksi
  revalidatePath("/dashboard"); // kartu ringkasan
  revalidatePath("/laporan"); // laporan

  return { ok: true, transactionId, replay: false };
}
