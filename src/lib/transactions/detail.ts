import { sourceBadge, type BadgeSpec, statusBadge, typeBadge } from "./view";
import type { TransactionSource, TransactionStatus } from "./filters";
import type { TransactionType } from "@/types";

/**
 * =====================================================================
 * DETAIL TRANSAKSI (P5.4.3) — pemetaan & query murni, tanpa UI.
 * =====================================================================
 * Prinsip (sesuai audit P5.4.1 & pola P5.4.2):
 * - Semua nilai numeric dari Supabase dikonversi memakai Number()
 *   secara defensif — TIDAK parseInt (nominal dapat berdesimal).
 * - TIDAK ada join ke `products`: identitas item memakai snapshot
 *   `product_name` (product_id bisa NULL setelah produk dihapus).
 * - `business_id` untuk seluruh query berasal dari lookup server
 *   (owner_id = auth.uid()) — TIDAK PERNAH dari URL/browser.
 */

/* ------------------------------------------------------------------ */
/* Util                                                                 */
/* ------------------------------------------------------------------ */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** params.id valid sebagai UUID — menolak input asing sebelum menyentuh DB. */
export function isValidUUID(value: string): boolean {
  return UUID_RE.test(value);
}

/** Konversi angka defensif: number → utuh; string → Number() (desimal). */
export function toSafeNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toText(value: unknown, fallback = ""): string {
  return typeof value === "string" && value !== "" ? value : fallback;
}

/** Hasil query `.maybeSingle()` */
export interface SingleQueryResult {
  data: unknown;
  error: unknown;
}

/**
 * Hasil pencarian transaksi per id:
 * - "error"  : query gagal (detail DB hanya ke log, bukan ke pengguna)
 * - "missing": tidak ada baris — belum ada ATAU bukan milik bisnis ini;
 *   keduanya diberikan JENIS respons aman yang sama oleh halaman
 * - "found"  : baris ditemukan
 */
export type DetailOutcome = "error" | "missing" | "found";

export function classifyTransactionRow(result: SingleQueryResult): DetailOutcome {
  if (result.error) return "error";
  return result.data ? "found" : "missing";
}

/* ------------------------------------------------------------------ */
/* Pemetaan baris → detail                                              */
/* ------------------------------------------------------------------ */

/** Baris mentah `transactions` — semua field opsional (defensif). */
export interface TransactionDetailRow {
  id?: unknown;
  business_id?: unknown;
  type?: unknown;
  title?: unknown;
  quantity?: unknown;
  unit_price?: unknown;
  total?: unknown;
  transacted_at?: unknown;
  payment_method?: unknown;
  source?: unknown;
  status?: unknown;
  notes?: unknown;
  request_id?: unknown;
}

export interface TransactionDetail {
  id: string;
  title: string;
  type: TransactionType;
  source: TransactionSource | null;
  status: TransactionStatus | null;
  /** nilai metode mentah (mis. "cash") — label UI memakai getPaymentLabel */
  paymentMethod: string;
  /** ISO timestamptz mentah */
  transactedAt: string;
  /** "30 Okt 2026" + waktu — kalender/jam Asia/Jakarta */
  dateLabel: string;
  timeLabel: string;
  /** angka desimal utuh — format rupiah dilakukan di UI */
  total: number;
  notes: string | null;
  /** request_id hanya diisi transaksi POS (idempotency create_sale) */
  requestId: string | null;
  /** ringkasan non-POS (dari baris transactions) */
  quantity: number;
  unitPrice: number;
}

/** Label tanggal + jam (WIB) untuk halaman detail. */
export function detailDateParts(iso: string): {
  dateLabel: string;
  timeLabel: string;
} {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return { dateLabel: "-", timeLabel: "-" };
  return {
    dateLabel: new Intl.DateTimeFormat("id-ID", {
      timeZone: "Asia/Jakarta",
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(date),
    timeLabel: new Intl.DateTimeFormat("id-ID", {
      timeZone: "Asia/Jakarta",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date),
  };
}

export function toTransactionDetail(
  row: TransactionDetailRow
): TransactionDetail {
  const iso = typeof row.transacted_at === "string" ? row.transacted_at : "";
  return {
    id: toText(row.id),
    title: toText(row.title, "(tanpa keterangan)"),
    type: row.type === "expense" ? "expense" : "income",
    source:
      row.source === "pos" ||
      row.source === "ai_chat" ||
      row.source === "receipt_scan" ||
      row.source === "manual"
        ? (row.source as TransactionSource)
        : null,
    status:
      row.status === "completed" ||
      row.status === "draft" ||
      row.status === "void"
        ? (row.status as TransactionStatus)
        : null,
    paymentMethod: toText(row.payment_method),
    transactedAt: iso,
    ...detailDateParts(iso),
    total: toSafeNumber(row.total),
    notes: typeof row.notes === "string" && row.notes !== "" ? row.notes : null,
    requestId: toText(row.request_id) || null,
    quantity: toSafeNumber(row.quantity),
    unitPrice: toSafeNumber(row.unit_price),
  };
}

/* ------------------------------------------------------------------ */
/* Pemetaan transaction_items                                           */
/* ------------------------------------------------------------------ */

/** Baris mentah `transaction_items` — semua field opsional. */
export interface TransactionItemRow {
  id?: unknown;
  product_id?: unknown;
  product_name?: unknown;
  quantity?: unknown;
  unit_price?: unknown;
  total?: unknown;
}

export interface TransactionItemDetail {
  id: string;
  /** NULL (produk dihapus) — nama tetap tampil dari product_name */
  productId: string | null;
  productName: string;
  quantity: number;
  unitPrice: number;
  /** subtotal dari database — TIDAK dihitung ulang di aplikasi */
  subtotal: number;
}

export function toTransactionItemDetail(
  row: TransactionItemRow
): TransactionItemDetail {
  return {
    id: toText(row.id),
    productId: toText(row.product_id) || null,
    productName: toText(row.product_name, "(nama tidak tercatat)"),
    quantity: toSafeNumber(row.quantity),
    unitPrice: toSafeNumber(row.unit_price),
    subtotal: toSafeNumber(row.total),
  };
}

/* ------------------------------------------------------------------ */
/* Query — transaksi per id + item transaksi                            */
/* ------------------------------------------------------------------ */

/**
 * Bentuk minimal chain yang dibutuhkan (subset PostgrestFilterBuilder).
 * Builder asli Supabase memenuhi bentuk ini; barrier `unknown` menghindari
 * instantiation generik TS2589 (pola sama dengan filters.ts P5.4.2).
 * Urutan kolom & isi query diverifikasi unit test (RecordingChain).
 */
interface DetailChain {
  eq(column: string, value: unknown): DetailChain;
  order(column: string, options?: { ascending?: boolean }): DetailChain;
  maybeSingle(): Promise<SingleQueryResult>;
}

/**
 * Filter transaksi per id: business_id (hasil lookup SERVER) PERTAMA,
 * lalu id — transaksi milik bisnis lain tidak pernah bisa terbaca
 * (RLS tetap lapisan pembatas di database).
 * Halaman memakai `.from("transactions").select(...)` — filter ditambah
 * di sini agar urutan dan isi dapat diuji.
 */
export function openTransactionById(
  query: unknown,
  businessId: string,
  transactionId: string
): unknown {
  const chain = query as DetailChain;
  return chain.eq("business_id", businessId).eq("id", transactionId).maybeSingle();
}

/**
 * Item transaksi: business_id (server) TERLEBIH DULU, lalu transaction_id —
 * TANPA join ke products (snapshot product_name dipakai apa adanya).
 * Diurutkan created_at naik agar tampil stabil.
 */
export function openTransactionItems(
  query: unknown,
  businessId: string,
  transactionId: string
): unknown {
  const chain = query as DetailChain;
  return chain
    .eq("business_id", businessId)
    .eq("transaction_id", transactionId)
    .order("created_at", { ascending: true });
}

/* ------------------------------------------------------------------ */
/* Re-ekspor badge agar halaman detail memakai satu sumber label         */
/* ------------------------------------------------------------------ */

export type { BadgeSpec as DetailBadgeSpec };
export {
  sourceBadge as detailSourceBadge,
  statusBadge as detailStatusBadge,
  typeBadge as detailTypeBadge,
};
