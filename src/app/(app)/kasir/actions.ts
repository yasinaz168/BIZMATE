"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { validateCheckout } from "@/lib/pos/validate";
import { logDbError, logAppError } from "@/lib/server-log";
import type { CreateSaleResult } from "@/types";

/**
 * SERVER ACTIONS — Kasir / Checkout POS (Tahap P5.2).
 *
 * Alur checkout:
 * 1. auth.getUser() — token divalidasi ke server Supabase (bukan getSession).
 * 2. Lookup bisnis milik user (fail-fast, TANPA kirim business_id ke RPC).
 * 3. validateCheckout atas field form (request_id, payment_method,
 *    items JSON, notes) — validasi P1 dipakai apa adanya.
 * 4. supabase.rpc("create_sale", ...) — database yang menangani
 *    kepemilikan, harga & nama dari tabel products, konsistensi item,
 *    pengurangan stok, atomicity, dan idempotency.
 *
 * KETAT:
 * - business_id TIDAK PERNAH diterima dari FormData/browser dan TIDAK
 *   PERNAH dikirim ke RPC (RPC menyelesaikannya sendiri via auth.uid()).
 * - Harga/nama/subtotal/total TIDAK PERNAH diterima dari browser —
 *   payload RPC hanya berisi kontrak SQL: p_request_id, p_payment_method,
 *   p_items (product_id + quantity), p_notes.
 * - request_id DITERIMA dari klien dan TIDAK PERNAH dibuat ulang di
 *   server — retry checkout wajib memakai request_id yang sama
 *   (idempotency dijaga oleh RPC 00005).
 * - Error RPC yang diketahui (pesan RAISE dari migration 00005) aman
 *   ditampilkan; error tak dikenal dicatat via logDbError lalu diganti
 *   pesan generik agar detail internal tidak bocor ke pengguna.
 */

export type CheckoutActionState = {
  error?: string;
  success?: string;
  /** Hasil RPC create_sale (transaksi baru maupun replay) */
  sale?: CreateSaleResult;
};

type ServerClient = Awaited<ReturnType<typeof createClient>>;

const RPC_NAME = "create_sale";

/** Pesan kegagalan query bisnis — TANPA detail database */
const BUSINESS_DB_ERROR = "Gagal memuat data bisnis. Silakan coba lagi.";
/** Pesan ketika bisnis memang belum dimiliki pengguna */
const NO_BUSINESS_ERROR = "Profil bisnis belum ada. Lengkapi data bisnis terlebih dahulu.";
/** Pesan generik untuk kegagalan checkout yang tidak dapat diidentifikasi aman */
const CHECKOUT_DB_ERROR = "Checkout gagal. Silakan coba lagi.";

/**
 * Hasil lookup bisnis — tiga kondisi dibedakan tegas:
 * - "found"      : query sukses & bisnis ditemukan
 * - "no_business": query sukses tetapi bisnis memang belum tersedia
 * - "db_error"   : query GAGAL — BUKAN berarti bisnis tidak ada
 *
 * Varian action kasir memakai pola yang sama dengan produk/actions.ts.
 */
type BusinessLookup =
  | { status: "found"; businessId: string }
  | { status: "no_business" }
  | { status: "db_error" };

/**
 * Ambil id bisnis milik pengguna yang terautentikasi.
 * Kegagalan query dicatat via logDbError dan dibedakan dari kondisi
 * "belum punya bisnis" agar pesan pengguna tidak menyesatkan.
 */
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
        route: "kasir/actions",
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

/**
 * Pesan-pesan error yang DIDIIS oleh migration 00005 (RAISE EXCEPTION).
 * Daftar ini stabil (kita pembuatnya) dan tidak memuat detail internal
 * database, sehingga aman ditampilkan langsung kepada pengguna.
 */
const RPC_ERROR_PREFIXES = [
  "request_id ",
  "Metode pembayaran",
  "Daftar item",
  "Keranjang belanja",
  "Maksimal 100 item",
  "Catatan ",
  "Sesi tidak valid",
  "Profil bisnis",
  "Anda tidak memiliki akses",
  "Format item",
  "product_id ",
  "quantity ",
  "request_id sudah",
  "Replay tidak dapat diverifikasi:",
  "Gagal memproses permintaan",
  "Produk tidak ditemukan",
  "Produk yang tidak aktif",
  "Stok ",
] as const;

const RPC_MESSAGE_MAX = 200;

/**
 * Punahkan pesan error RPC:
 * - bila cocok dengan pesan yang dibuat migration 00005 → dilewatkan
 *   karena aman & berguna bagi kasir (termasuk pesan stok);
 * - bila tidak dikenal (jaringan, pengecualian tak terduga) → null,
 *   ditangani dengan pesan generik agar detail internal tidak bocor.
 */
function safeSaleError(message: string): string | null {
  const cleaned = message.trim();
  if (cleaned.length === 0) return null;
  const known = RPC_ERROR_PREFIXES.some((prefix) => cleaned.startsWith(prefix));
  if (!known) return null;
  return cleaned.length > RPC_MESSAGE_MAX
    ? `${cleaned.slice(0, RPC_MESSAGE_MAX)}…`
    : cleaned;
}

/**
 * Tahan bentuk respons RPC terhadap kontrak CreateSaleResult
 * (jsonb_build_object di migration 00005, baris 345-351 & 526-532).
 */
function isCreateSaleResult(value: unknown): value is CreateSaleResult {
  if (typeof value !== "object" || value === null) return false;
  const r = value as Record<string, unknown>;
  // TypeScript tidak menyarikan akses properti antar-pernyataan — nilai
  // diekstrak ke variabel lokal agar tiap pemeriksaan tipe menyempitkan.
  const transactionId = r.transaction_id;
  const total = r.total;
  const itemCount = r.item_count;
  const totalQuantity = r.total_quantity;
  const idempotentReplay = r.idempotent_replay;
  return (
    typeof transactionId === "string" &&
    transactionId.length > 0 &&
    typeof total === "number" &&
    Number.isFinite(total) &&
    typeof itemCount === "number" &&
    Number.isInteger(itemCount) &&
    itemCount >= 0 &&
    typeof totalQuantity === "number" &&
    Number.isFinite(totalQuantity) &&
    typeof idempotentReplay === "boolean"
  );
}

/**
 * Checkout POS.
 *
 * request_id DITERIMA dari klien (UUID tervalidasi) — server TIDAK PERNAH
 * membuatnya ulang; retry dari klien memakai request_id yang sama dan
 * akan kembali sebagai transaksi sebelumnya (idempotent_replay).
 */
export async function createSaleAction(
  _prevState: CheckoutActionState | null,
  formData: FormData
): Promise<CheckoutActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Sesi berakhir. Silakan login ulang." };
  }

  const lookup = await resolveBusinessId(supabase, user.id);
  if (lookup.status === "db_error") {
    // Kegagalan query — jangan tampilkan sebagai "bisnis belum ada"
    return { error: BUSINESS_DB_ERROR };
  }
  if (lookup.status === "no_business") {
    return { error: NO_BUSINESS_ERROR };
  }

  // Items dikirim klien sebagai JSON array CartItem di field "items".
  let parsedItems: unknown;
  const rawItemsText = String(formData.get("items") ?? "");
  try {
    parsedItems = JSON.parse(rawItemsText);
  } catch {
    // Bukan JSON → ditolak validateCheckout dengan pesan standar
    parsedItems = rawItemsText;
  }

  const parsed = validateCheckout({
    request_id: formData.get("request_id"),
    payment_method: formData.get("payment_method"),
    items: parsedItems,
    notes: formData.get("notes"),
  });

  if (!parsed.valid || !parsed.data) {
    return { error: parsed.errors.join(" ") };
  }

  // Kontrak RPC persis signature migration 00005 — tanpa business_id,
  // tanpa harga/total/nama/stok dari klien.
  const rpcArgs = {
    p_request_id: parsed.data.request_id,
    p_payment_method: parsed.data.payment_method,
    p_items: parsed.data.items,
    p_notes: parsed.data.notes,
  };

  const { data: sale, error: rpcError } = await supabase.rpc(RPC_NAME, rpcArgs);

  if (rpcError) {
    logDbError(
      {
        route: "kasir/actions",
        table: "create_sale",
        op: "insert",
        step: "checkout POS",
      },
      rpcError
    );
    const safe = safeSaleError(rpcError.message);
    return { error: safe ?? CHECKOUT_DB_ERROR };
  }

  if (!isCreateSaleResult(sale)) {
    logAppError("kasir/actions: respons create_sale tidak sesuai kontrak.", sale);
    return { error: CHECKOUT_DB_ERROR };
  }

  if (sale.idempotent_replay) {
    return {
      success: "Checkout sudah pernah diproses — transaksi sebelumnya dikembalikan.",
      sale,
    };
  }

  revalidatePath("/", "layout"); // dashboard & header ikut terbaru
  revalidatePath("/produk"); // stok berubah akibat penjualan
  revalidatePath("/kasir"); // halaman kasir (dibangun di P5.3)

  return { success: "Checkout berhasil. Transaksi tersimpan.", sale };
}
