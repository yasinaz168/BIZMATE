import { isoToStartOfDayUTC } from "@/lib/time";
import type { PaymentMethod, TransactionType } from "@/types";

/**
 * =====================================================================
 * FILTER & QUERY DAFTAR TRANSAKSI (P5.4.2) — lib bersih tanpa UI.
 * =====================================================================
 * Prinsip:
 * - Semua parameter diambil dari URL DIHAPUS/ DINORMALKAN DI SERVER.
 *   Parameter tidak valid diabaikan aman (tidak pernah masuk query DB).
 * - business_id SELALU hasil lookup server (owner_id = auth.uid()) dan
 *   diteruskan ke query via openTransactionList() — TIDAK PERNAH dari
 *   browser. Ini lapisan aplikasi di atas RLS (RLS tetap pembatas baris).
 * - Tanggal memakai helper lama src/lib/time.ts (Asia/Jakarta).
 *   `to` memakai akhir hari WIB sehingga hari yang sama ikut terfilter.
 */

export const PAGE_SIZE = 10;
export const MAX_SEARCH_LENGTH = 100;
export const MAX_PAGE = 1000;
/** Batas baris ringkasan nominal — di atas ini ringkasan disembunyikan. */
export const SUMMARY_MAX_ROWS = 2000;

export type TransactionSource = "pos" | "ai_chat" | "receipt_scan" | "manual";
export type TransactionStatus = "completed" | "draft" | "void";

/** Keputusan produk (R1): HANYA 'completed' masuk ringkasan keuangan. */
export const COMPLETED_STATUS: TransactionStatus = "completed";

export interface TransactionFilters {
  /** Sudah disanitasi (tanpa koma/kurung); "" = tanpa pencarian. */
  q: string;
  /** "yyyy-MM-dd" kalender Jakarta — null = tidak difilter. */
  fromDay: string | null;
  toDay: string | null;
  type: TransactionType | null;
  source: TransactionSource | null;
  paymentMethod: PaymentMethod | null;
  status: TransactionStatus | null;
  page: number; // >= 1
}

type ParamBag = Record<string, string | string[] | undefined>;

/** Nilai pertama dari parameter URL (bila dikirim berulang/array). */
function firstParam(sp: ParamBag, key: string): string {
  const v = sp[key];
  const s = typeof v === "string" ? v : Array.isArray(v) ? v[0] : undefined;
  return typeof s === "string" ? s : "";
}

/* ------------------------------------------------------------------ */
/* Tanggal — BANTUAN BARU minimal: akhir hari WIB                        */
/* (awal hari memakai isoToStartOfDayUTC yang sudah ada di lib/time).   */
/* ------------------------------------------------------------------ */

/** Akhir hari (23:59:59.999 WIB) → ISO UTC, untuk filter `to`. */
export function isoDayEndUTC(isoDay: string): string {
  const startMs = new Date(isoToStartOfDayUTC(isoDay)).getTime();
  return new Date(startMs + 24 * 60 * 60 * 1000 - 1).toISOString();
}

const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** Validitas kalender NYATA (menolak 2026-13-45, 31 Feb, dst.), bukan sekadar bentuk. */
export function isValidISODay(value: string): boolean {
  if (!ISO_DAY_RE.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  if (month < 1 || month > 12) return false;
  const isLeap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const maxDay = month === 2 && isLeap ? 29 : DAYS_IN_MONTH[month - 1];
  return day >= 1 && day <= maxDay;
}

/* ------------------------------------------------------------------ */
/* Pencarian                                                            */
/* ------------------------------------------------------------------ */

/**
 * Sanitasi nilai `q`:
 * - koma & kurung dihapus agar aman di dalam string filter `or()` PostgREST;
 * - spasi ekstra dirapikan & panjang dibatasi.
 * Escape karakter khusus LIKE (\ % _) dilakukan TERPISAH di sisi
 * pembangun query (buildSearchOrFilter) agar nilai ini tetap aman
 * disimpan kembali ke URL pagination tanpa ter-escape berulang.
 */
function sanitizeQ(raw: string): string {
  return raw.replace(/[,()]/g, "").replace(/\s+/g, " ").trim().slice(0, MAX_SEARCH_LENGTH);
}

/** Escape karakter khusus ILIKE Postgres. */
export function escapeLikePattern(text: string): string {
  return text.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/**
 * Filter `or()` untuk pencarian title + notes, contoh:
 * "title.ilike.%kopi%,notes.ilike.%kopi%" — null bila q kosong.
 */
export function buildSearchOrFilter(q: string): string | null {
  if (!q) return null;
  const pattern = escapeLikePattern(q);
  return `title.ilike.%${pattern}%,notes.ilike.%${pattern}%`;
}

/* ------------------------------------------------------------------ */
/* Parsing parameter URL → filter ternormalisasi                        */
/* ------------------------------------------------------------------ */

export function parseTransactionsParams(sp: ParamBag): TransactionFilters {
  // type: income / expense
  const rawType = firstParam(sp, "type");
  const type = rawType === "income" || rawType === "expense" ? rawType : null;

  // source: pos / ai_chat / receipt_scan / manual
  const rawSource = firstParam(sp, "source");
  const source: TransactionSource | null =
    rawSource === "pos" || rawSource === "ai_chat" || rawSource === "receipt_scan" || rawSource === "manual"
      ? (rawSource as TransactionSource)
      : null;

  // payment_method: cash / transfer / qris / ewallet
  const rawPayment = firstParam(sp, "payment_method");
  const paymentMethod: PaymentMethod | null =
    rawPayment === "cash" || rawPayment === "transfer" || rawPayment === "qris" || rawPayment === "ewallet"
      ? (rawPayment as PaymentMethod)
      : null;

  // status: completed / draft / void
  const rawStatus = firstParam(sp, "status");
  const status: TransactionStatus | null =
    rawStatus === "completed" || rawStatus === "draft" || rawStatus === "void"
      ? (rawStatus as TransactionStatus)
      : null;

  // from / to: dua-duanya harus hari kalender valid. Bila keduanya
  // valid tetapi urutannya terbalik → keduanya diabaikan.
  const fromCandidate = firstParam(sp, "from");
  const toCandidate = firstParam(sp, "to");
  const fromValid = isValidISODay(fromCandidate) ? fromCandidate : null;
  const toValid = isValidISODay(toCandidate) ? toCandidate : null;
  let fromDay = fromValid;
  let toDay = toValid;
  if (fromDay && toDay && fromDay > toDay) {
    // Urutan terbalik → keduanya diabaikan agar hasil tidak membingungkan.
    fromDay = null;
    toDay = null;
  }

  // page: bilangan bulat 1..MAX_PAGE; selain itu dianggap halaman 1
  const rawPage = Number(firstParam(sp, "page"));
  const page =
    Number.isInteger(rawPage) && rawPage >= 1 ? Math.min(rawPage, MAX_PAGE) : 1;

  return {
    q: sanitizeQ(firstParam(sp, "q")),
    fromDay,
    toDay,
    type,
    source,
    paymentMethod,
    status,
    page,
  };
}

/** Ada filter/pencarian aktif (memengaruhi empty state & tombol reset). */
export function hasActiveTransactionFilter(f: TransactionFilters): boolean {
  return Boolean(
    f.q || f.fromDay || f.toDay || f.type || f.source || f.paymentMethod || f.status
  );
}

/* ------------------------------------------------------------------ */
/* Batas tanggal → nilai UTC untuk query                                */
/* ------------------------------------------------------------------ */

export interface DateGates {
  from: string | null; // awal hari WIB (ISO UTC)
  to: string | null; // akhir hari WIB (ISO UTC, inklusif)
}

export function transactionDateGates(f: TransactionFilters): DateGates {
  return {
    from: f.fromDay ? isoToStartOfDayUTC(f.fromDay) : null,
    to: f.toDay ? isoDayEndUTC(f.toDay) : null,
  };
}

/* ------------------------------------------------------------------ */
/* Rencana filter (daftar operasi query — murni & mudah diuji)           */
/* ------------------------------------------------------------------ */

export interface TransactionFilterOp {
  op: "eq" | "gte" | "lte" | "or";
  column: string;
  /** untuk op "or" berisi string filter PostgREST; lainnya nilai kolom. */
  value: string;
}

/** Urutan deterministik: type → source → payment → status → tanggal → cari. */
export function transactionFilterOps(f: TransactionFilters): TransactionFilterOp[] {
  const ops: TransactionFilterOp[] = [];
  if (f.type) ops.push({ op: "eq", column: "type", value: f.type });
  if (f.source) ops.push({ op: "eq", column: "source", value: f.source });
  if (f.paymentMethod)
    ops.push({ op: "eq", column: "payment_method", value: f.paymentMethod });
  if (f.status) ops.push({ op: "eq", column: "status", value: f.status });

  const gates = transactionDateGates(f);
  if (gates.from) ops.push({ op: "gte", column: "transacted_at", value: gates.from });
  if (gates.to) ops.push({ op: "lte", column: "transacted_at", value: gates.to });

  const search = buildSearchOrFilter(f.q);
  if (search) ops.push({ op: "or", column: "", value: search });
  return ops;
}

/* ------------------------------------------------------------------ */
/* Pembangun query                                                      */
/* ------------------------------------------------------------------ */

/**
 * Hasil await query daftar/ringkasan — bentuk respons Supabase
 * (data baris mentah, error, dan count exact bila diminta).
 */
export interface DbQueryResult {
  data: unknown;
  error: unknown;
  count: number | null;
}

/**
 * Bentuk minimal "chain" PostgREST yang dibutuhkan daftar transaksi.
 * Builder asli Supabase (PostgrestFilterBuilder) memenuhi bentuk ini;
 * barrier `unknown` di halaman (cast sekali di await) dipakai agar
 * instantiation generik bermaterialisasi-dalam supabase-js tidak
 * memicu TS2589. Kesalahan pembangunan kolom ditangkap oleh unit test
 * (RecordingChain memverifikasi urutan & isi seluruh operasi).
 */
interface ChainDigest {
  eq(column: string, value: unknown): ChainDigest;
  gte(column: string, value: unknown): ChainDigest;
  lte(column: string, value: unknown): ChainDigest;
  or(filter: string): ChainDigest;
  range(from: number, to: number): ChainDigest;
  order(column: string, options?: { ascending?: boolean }): ChainDigest;
}

/** business_id (dari server) + semua filter aktif — page & ringkasan. */
function applyBusinessAndFilters(
  query: ChainDigest,
  businessId: string,
  f: TransactionFilters
): ChainDigest {
  // SELALU pertama — isolasi bisnis berbasis lookup server, bukan URL.
  let q = query.eq("business_id", businessId);
  for (const op of transactionFilterOps(f)) {
    switch (op.op) {
      case "eq":
        q = q.eq(op.column, op.value);
        break;
      case "gte":
        q = q.gte(op.column, op.value);
        break;
      case "lte":
        q = q.lte(op.column, op.value);
        break;
      case "or":
        q = q.or(op.value);
        break;
    }
  }
  return q;
}

/**
 * Daftar transaksi satu halaman: business_id + filter + urutan stabil
 * (transacted_at desc, lalu id desc) + range pagination.
 * Input/return `unknown` (di-cast ke DbQueryResult di halaman).
 */
export function openTransactionList(
  query: unknown,
  businessId: string,
  f: TransactionFilters
): unknown {
  const chain = query as ChainDigest;
  const ordered = applyBusinessAndFilters(chain, businessId, f)
    .order("transacted_at", { ascending: false })
    .order("id", { ascending: false });
  const { from, to } = pageToRange(f.page);
  return ordered.range(from, to);
}

/**
 * Query ringkasan KEUANGAN: business_id + filter aktif + SELALU
 * status='completed' (R1 — draft & void tidak dihitung) — TANPA
 * range/order (semua baris yang cocok). Hanya dipakai bila jumlah
 * baris ≤ SUMMARY_MAX_ROWS.
 */
export function openTransactionTotals(
  query: unknown,
  businessId: string,
  f: TransactionFilters
): unknown {
  return applyBusinessAndFilters(query as ChainDigest, businessId, f).eq(
    "status",
    COMPLETED_STATUS
  );
}

/* ------------------------------------------------------------------ */
/* Pagination                                                           */
/* ------------------------------------------------------------------ */

export interface PageRange {
  from: number;
  to: number;
}

/** offset/limit PostgREST dari nomor halaman (1-based). */
export function pageToRange(page: number): PageRange {
  const from = (page - 1) * PAGE_SIZE;
  return { from, to: from + PAGE_SIZE - 1 };
}

/** Bentalk halaman ke rentang yang benar berdasarkan total item. */
export function clampPage(page: number, totalItems: number): number {
  if (totalItems <= 0) return 1;
  return Math.min(page, Math.ceil(totalItems / PAGE_SIZE));
}

/* ------------------------------------------------------------------ */
/* URL — mempertahankan seluruh filter saat berpindah halaman           */
/* ------------------------------------------------------------------ */

export function buildTransactionsHref(f: TransactionFilters, page: number): string {
  const params = new URLSearchParams();
  if (f.q) params.set("q", f.q);
  if (f.fromDay) params.set("from", f.fromDay);
  if (f.toDay) params.set("to", f.toDay);
  if (f.type) params.set("type", f.type);
  if (f.source) params.set("source", f.source);
  if (f.paymentMethod) params.set("payment_method", f.paymentMethod);
  if (f.status) params.set("status", f.status);
  const safePage = Math.max(1, Math.round(page));
  if (safePage > 1) params.set("page", String(safePage));
  const qs = params.toString();
  return qs ? `/transaksi?${qs}` : "/transaksi";
}
