import type { TransactionType } from "@/types";
import type { BadgeVariant } from "./badge-variants";
import type { TransactionSource, TransactionStatus } from "./filters";

/**
 * =====================================================================
 * PEMETAAN & LABEL BARIS TRANSAKSI (P5.4.2) — murni, tanpa query.
 * =====================================================================
 * - `total` DIPERLAKUKAN sebagai angka desimal: konversi memakai Number(),
 *   TIDAK parseInt (nominal bisa berpecahan 2 desimal dari POS).
 * - Tanggal tampil menurut kalender Asia/Jakarta (bukan zona server).
 * - Halaman daftar TIDAK mengasumsikan setiap transaksi memiliki
 *   transaction_items (detail item adalah fitur halaman detail).
 */

/**
 * Baris mentah dari tabel `transactions` — semua field opsional agar
 * pemetaan selalu defensif (nilai hilang/tak dikenal → fallback aman).
 */
export interface TransactionRawRow {
  id?: unknown;
  title?: unknown;
  type?: unknown;
  source?: unknown;
  status?: unknown;
  payment_method?: unknown;
  transacted_at?: unknown;
  total?: unknown;
}

/** Konversi angka aman: number → sama; string → Number() (desimal utuh). */
function toNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toText(value: unknown, fallback = ""): string {
  return typeof value === "string" && value !== "" ? value : fallback;
}

export interface TransactionListItem {
  id: string;
  title: string;
  type: TransactionType;
  source: TransactionSource | null;
  status: TransactionStatus | null;
  paymentLabel: string;
  /** ISO timestamptz mentah (dipertahankan untuk halaman detail nanti). */
  transactedAt: string;
  /** angka desimal utuh — format rupiah dilakukan di UI */
  total: number;
  /** label tanggal "28 Okt 2026" kalender Jakarta */
  dateLabel: string;
}

/** "2026-10-30T17:30:00Z" (= 01:30 WIB) → "31 Okt 2026" — batas hari WIB. */
export function transactionDateLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function toTransactionListItem(row: TransactionRawRow): TransactionListItem {
  const type: TransactionType = row.type === "expense" ? "expense" : "income";
  const iso = typeof row.transacted_at === "string" ? row.transacted_at : "";
  return {
    id: toText(row.id),
    title: toText(row.title, "(tanpa keterangan)"),
    type,
    source:
      row.source === "pos" ||
      row.source === "ai_chat" ||
      row.source === "receipt_scan" ||
      row.source === "manual"
        ? (row.source as TransactionSource)
        : null,
    status:
      row.status === "completed" || row.status === "draft" || row.status === "void"
        ? (row.status as TransactionStatus)
        : null,
    paymentLabel: toText(row.payment_method),
    transactedAt: iso,
    total: toNumber(row.total),
    dateLabel: transactionDateLabel(iso),
  };
}

/* ------------------------------------------------------------------ */
/* Badge & label                                                        */
/* ------------------------------------------------------------------ */

export interface BadgeSpec {
  label: string;
  variant: BadgeVariant;
}

const SOURCE_BADGES: Record<TransactionSource, BadgeSpec> = {
  pos: { label: "POS", variant: "deep" },
  ai_chat: { label: "AI Chat", variant: "default" },
  receipt_scan: { label: "Nota", variant: "muted" },
  manual: { label: "Manual", variant: "outline" },
};

export function sourceBadge(source: TransactionSource | null): BadgeSpec | null {
  if (!source) return null;
  return SOURCE_BADGES[source];
}

export function typeBadge(type: TransactionType): BadgeSpec {
  return {
    label: type === "income" ? "Pemasukan" : "Pengeluaran",
    variant: type === "income" ? "income" : "expense",
  };
}

const STATUS_BADGES: Record<TransactionStatus, BadgeSpec> = {
  completed: { label: "Selesai", variant: "outline" },
  draft: { label: "Draf", variant: "muted" },
  void: { label: "Dibatalkan", variant: "expense" },
};

export function statusBadge(status: TransactionStatus | null): BadgeSpec | null {
  if (!status) return null;
  return STATUS_BADGES[status];
}

/* ------------------------------------------------------------------ */
/* Ringkasan nominal (dihitung server, bukan dari halaman pagination)    */
/* ------------------------------------------------------------------ */

export interface FilteredSummary {
  income: number;
  expense: number;
}

/**
 * Jumlahkan nominal baris mentah per jenis — desimal aman via Number().
 * R1 (guard agregasi): baris berstatus draft/void TIDAK pernah dihitung
 * (lapis kedua di atas filter query status='completed' di lib/filters).
 */
export function summarizeTransactionTotals(
  rows: ReadonlyArray<{ type?: unknown; total?: unknown; status?: unknown }>
): FilteredSummary {
  let income = 0;
  let expense = 0;
  for (const row of rows) {
    if (row.status === "draft" || row.status === "void") continue;
    const total = toNumber(row.total);
    if (row.type === "income") income += total;
    else if (row.type === "expense") expense += total;
    // jenis tak dikenal diabaikan (schema hanya mengizinkan income/expense)
  }
  return { income, expense };
}
