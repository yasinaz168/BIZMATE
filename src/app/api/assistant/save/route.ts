import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { validateTransaction } from "@/lib/ai/validate";
import {
  isSameAiPayload,
  normalizeAiRequestId,
  rowToAiPayload,
  validatedToAiPayload,
  type AiPayloadComparable,
} from "@/lib/ai/save-idempotency";
import { checkRateLimit } from "@/lib/rate-limit";
import { logDbError } from "@/lib/server-log";
import { formatIDR } from "@/lib/format";

/**
 * POST /api/assistant/save
 *
 * SATU-SATUNYA pintu menuju tabel transactions dari AI Chat.
 * - Validasi ULANG seluruh data di server (preview browser tidak dipercaya).
 * - Total = Math.round(quantity × unit_price) — dihitung DI SERVER.
 * - request_id wajib (UUID dibuat CLIENT per draf) — kunci idempotency
 *   (R2.4) memakai unique partial index (business_id, request_id)
 *   migration 00005 §4.
 *
 * IDEMPOTENCY (R2.4) — semantik identik RPC POS:
 * - INSERT biasa + deteksi SQLSTATE 23505 + read-back (ON CONFLICT
 *   ber-target PostgREST tidak aman untuk unique index PARTIAL).
 * - request_id sama + payload sama → replay: transactionId LAMA,
 *   replay = true, TANPA baris baru & TANPA revalidatePath.
 * - request_id sama + payload beda → DITOLAK dengan pesan aman.
 * - Baris lama WAJIB source 'ai_chat' sebelum replay diterima; transaksi
 *   lama TIDAK PERNAH diubah (append-only).
 *
 * RATE LIMITING (AI-R3.3) — 20 permintaan/menit per user, dengan URUTAN
 * yang dijamin aman sebelum 429:
 *   1. validasi request_id + payload (validator R2.4)   → 400
 *   2. business_id dari lookup server                    → 409
 *   3. cek transaksi lama (business_id + request_id)
 *   4. bandingkan payload (isSameAiPayload)
 *   5. cocok      → 200 replay:true (tanpa INSERT)
 *   6. berbeda    → 409
 *   7. tidak ada  → 429 + Retry-After
 * Artinya request_id yang sudah pernah berhasil TIDAK PERNAH terkunci
 * 429 — retry setelah respons hilang tetap memperoleh hasil replay.
 * Jalur lolos-limit TIDAK berubah (INSERT + 23505 read-back, tanpa
 * tambahan query).
 */

type BusinessId = string;

/** Kolom read-back pembandingan payload idempotency */
const READBACK_COLUMNS =
  "id, source, type, title, quantity, unit_price, total, transacted_at, payment_method, notes";

const INSERT_DB_ERROR = "Gagal menyimpan transaksi ke database.";
const IDEMPOTENCY_VERIFY_ERROR =
  "Gagal memverifikasi percobaan sebelumnya. Silakan coba lagi.";
const REPLAY_MISMATCH_ERROR =
  "Permintaan ini sudah pernah diproses dengan data yang berbeda. Periksa kembali draf transaksi.";
const RATE_LIMITED_ERROR = "Terlalu banyak permintaan. Coba lagi dalam beberapa saat.";

/** Unique violation (SQLSTATE 23505) */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "23505"
  );
}

/**
 * Verifikasi transaksi lama untuk request_id yang sama (dipakai jalur
 * 23505 maupun jalur rate-limit — satu sumber kebenaran).
 * SELALU read-only: tidak pernah mengubah baris lama.
 */
type ReplayVerdict =
  | { kind: "replay"; transactionId: string }
  | { kind: "mismatch" }
  | { kind: "missing" }
  | { kind: "verify_error" };

async function verifyExistingSale(
  supabase: Awaited<ReturnType<typeof createClient>>,
  businessId: BusinessId,
  requestId: string,
  incoming: AiPayloadComparable
): Promise<ReplayVerdict> {
  const { data: existing, error: readError } = await supabase
    .from("transactions")
    .select(READBACK_COLUMNS)
    .eq("business_id", businessId) // isolasi: business_id dari lookup server
    .eq("request_id", requestId)
    .maybeSingle();

  if (readError) {
    logDbError(
      {
        route: "api/assistant/save",
        table: "transactions",
        op: "select",
        step: "read-back idempotency",
      },
      readError
    );
    return { kind: "verify_error" };
  }
  if (!existing) {
    return { kind: "missing" };
  }

  const oldRow = existing as Record<string, unknown>;

  // Replay hanya untuk sesama jalur ai_chat.
  if (oldRow.source !== "ai_chat") {
    return { kind: "mismatch" };
  }

  const stored = rowToAiPayload(oldRow);
  if (!isSameAiPayload(stored, incoming)) {
    return { kind: "mismatch" };
  }
  return { kind: "replay", transactionId: String(oldRow.id ?? "") };
}

/** Respons 200 replay (kontrak R2.4 dipertahankan). */
function replayResponse(transactionId: string) {
  return NextResponse.json({
    ok: true,
    transactionId,
    replay: true,
    summary: "Transaksi ini sudah pernah diproses sebelumnya dan tidak dibuat ulang.",
  });
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Supabase belum dikonfigurasi. Isi .env.local terlebih dahulu." },
      { status: 503 }
    );
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sesi berakhir. Silakan login ulang." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    transaction?: unknown;
    request_id?: unknown;
  } | null;

  // ---------- [mandat 1a] request_id (idempotency R2.4 — UUID wajib) ----------
  const requestId = normalizeAiRequestId(body?.request_id);
  if (!requestId.ok) {
    return NextResponse.json(
      { error: requestId.error ?? "request_id wajib diisi." },
      { status: 400 }
    );
  }

  // ---------- [mandat 1b] validasi payload transaksi di server ----------
  const validation = validateTransaction(body?.transaction);
  if (!validation.valid || !validation.data) {
    return NextResponse.json(
      {
        error: "Data transaksi belum valid. Periksa kembali form-nya.",
        errors: validation.errors,
      },
      { status: 400 }
    );
  }
  const tx = validation.data;
  const incoming = validatedToAiPayload(tx);

  // ---------- [mandat 2] bisnis (RLS aktif) — dari server, bukan browser ----------
  const { data: business } = await supabase
    .from("businesses")
    .select("id")
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!business) {
    return NextResponse.json({ error: "Profil bisnis belum ada." }, { status: 409 });
  }
  const businessId: BusinessId = business.id;

  // ---------- rate limiting (AI-R3.3) dengan replay bypass ----------
  const rate = await checkRateLimit("save", user.id);
  if (!rate.allowed) {
    // Sebelum 429: verifikasi replay dulu (mandat 3-7). request_id yang
    // sudah pernah berhasil tetap memperoleh hasilnya.
    const verdict = await verifyExistingSale(
      supabase,
      businessId,
      requestId.value,
      incoming
    );
    if (verdict.kind === "replay") {
      // [mandat 5] cocok → 200 replay:true, tanpa baris baru
      return replayResponse(verdict.transactionId);
    }
    if (verdict.kind === "mismatch") {
      // [mandat 6] request_id sama, payload beda → 409
      return NextResponse.json({ error: REPLAY_MISMATCH_ERROR }, { status: 409 });
    }
    if (verdict.kind === "verify_error") {
      // read-back gagal → pesan aman (bukan 429 yang menyesatkan)
      return NextResponse.json({ error: IDEMPOTENCY_VERIFY_ERROR }, { status: 500 });
    }
    // [mandat 7] tidak ada transaksi lama + limit tercapai → 429
    return NextResponse.json(
      { error: RATE_LIMITED_ERROR },
      {
        status: 429,
        headers: { "Retry-After": String(rate.retryAfterSeconds) },
      }
    );
  }

  // ---------- simpan (idempotent per request_id — jalur normal R2.4) ----------
  const { data: inserted, error } = await supabase
    .from("transactions")
    .insert({
      business_id: businessId,
      type: tx.type,
      title: tx.title,
      quantity: tx.quantity,
      unit_price: tx.unit_price,
      total: tx.total, // dihitung server, bukan dari browser
      transacted_at: tx.transacted_at_iso,
      payment_method: tx.payment_method ?? "cash", // default form; tampil jelas di preview
      source: "ai_chat",
      status: "completed",
      notes: tx.notes || null,
      request_id: requestId.value,
    })
    .select("id")
    .single();

  /* ---------- konflik request_id (23505) → read-back idempotency ---------- */
  if (error) {
    if (!isUniqueViolation(error)) {
      logDbError(
        {
          route: "api/assistant/save",
          table: "transactions",
          op: "insert",
          step: "konfirmasi pengguna",
        },
        error
      );
      return NextResponse.json({ error: INSERT_DB_ERROR }, { status: 500 });
    }

    const verdict = await verifyExistingSale(
      supabase,
      businessId,
      requestId.value,
      incoming
    );
    if (verdict.kind === "replay") {
      // Replay: transaksi lama dikembalikan — TANPA revalidatePath (pola POS).
      return replayResponse(verdict.transactionId);
    }
    if (verdict.kind === "mismatch") {
      return NextResponse.json({ error: REPLAY_MISMATCH_ERROR }, { status: 409 });
    }
    // missing / verify_error pada jalur konflik → tidak dapat diverifikasi
    return NextResponse.json({ error: IDEMPOTENCY_VERIFY_ERROR }, { status: 500 });
  }

  if (!inserted) {
    logDbError(
      {
        route: "api/assistant/save",
        table: "transactions",
        op: "insert",
        step: "id transaksi hilang",
      },
      null
    );
    return NextResponse.json({ error: INSERT_DB_ERROR }, { status: 500 });
  }

  const transactionId = String(
    (inserted as Record<string, unknown>).id ?? ""
  );
  if (!transactionId) {
    logDbError(
      {
        route: "api/assistant/save",
        table: "transactions",
        op: "insert",
        step: "id transaksi hilang",
      },
      null
    );
    return NextResponse.json({ error: INSERT_DB_ERROR }, { status: 500 });
  }

  // ---------- dashboard & halaman ikut memakai data terbaru ----------
  revalidatePath("/", "layout");

  return NextResponse.json({
    ok: true,
    transactionId,
    replay: false,
    summary: `${tx.type === "income" ? "Pemasukan" : "Pengeluaran"} ${tx.title} ${formatIDR(tx.total)} tersimpan.`,
  });
}
