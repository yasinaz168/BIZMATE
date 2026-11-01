/**
 * =====================================================================
 * IDEMPOTENCY TRANSAKSI AI (R2.4) — murni, tanpa React/Supabase.
 * =====================================================================
 * Dipakai oleh /api/assistant/save dan komponen chat; dipisah dari
 * manual-validate karena KONTRAK TIPENYA BERBEDA:
 * - transaksi manual memakai bentuk ternormalisasi camelCase
 *   (ManualPayloadComparable — manual-validate.ts);
 * - transaksi AI memakai bentuk snake_case yang sama dengan kolom DB &
 *   ValidatedTransaction (lib/ai/types.ts): unit_price, transacted_at,
 *   payment_method (nullable), notes.
 *
 * Semantik pembandingan IDENTIK dengan isSameManualPayload:
 * - angka: Number() + round2 (desimal-safe untuk baris DB "5.00" → 5);
 * - notes kosong/null/space ≡ sama; berisi → sama setelah trim;
 * - title dibandingkan setelah trim (normalisasi validator AI);
 * - request_id TIDAK dibandingkan (memang kunci yang sama).
 */

/** UUID (semua versi) — pola identik pos/validate.ts & manual-validate.ts */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validasi request_id dari body klien (UUID wajib, dibuat oleh CLIENT).
 * Kembalikan nilai terpangkas bila sah; selain itu pesan error aman yang
 * konsisten dengan validator POS/manual.
 */
export function normalizeAiRequestId(raw: unknown): {
  ok: boolean;
  value: string;
  error?: string;
} {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) {
    return { ok: false, value: "", error: "request_id wajib diisi." };
  }
  if (!UUID_RE.test(value)) {
    return {
      ok: false,
      value: "",
      error: "request_id harus berupa UUID yang valid.",
    };
  }
  return { ok: true, value };
}

/** UUID request_id untuk satu draf transaksi AI (client-side). */
export function newAiRequestId(): string {
  return crypto.randomUUID();
}

/** Bulatkan ke 2 desimal (presisi numeric(…,2)). */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** ISO kanonik dari nilai timestamptz (DB maupun validator). */
function toCanonicalIso(value: unknown): string {
  const date = new Date(String(value ?? ""));
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

/**
 * Bentuk pembanding payload AI — cocok dengan kolom tabel `transactions`
 * yang benar-benar disimpan untuk source 'ai_chat'.
 */
export interface AiPayloadComparable {
  type: string;
  title: string;
  quantity: number;
  unit_price: number;
  total: number;
  /** ISO UTC kanonik (setara transacted_at validator / timestamptz DB) */
  transacted_at: string;
  payment_method: string | null;
  notes: string | null;
}

/**
 * Hasil validator AI (ValidatedTransaction / AiTransaction + total)
 * → bentuk pembanding. transacted_at memakai transacted_at_iso (kanonik).
 */
export function validatedToAiPayload(v: {
  type: string;
  title: string;
  quantity: number;
  unit_price: number;
  total: number;
  transacted_at_iso: string;
  payment_method: string | null;
  notes: string;
}): AiPayloadComparable {
  return {
    type: v.type,
    title: v.title,
    quantity: v.quantity,
    unit_price: v.unit_price,
    total: v.total,
    transacted_at: toCanonicalIso(v.transacted_at_iso),
    payment_method: v.payment_method,
    notes: v.notes === "" ? null : v.notes,
  };
}

/** Baris DB (read-back) → bentuk pembanding. */
export function rowToAiPayload(row: Record<string, unknown>): AiPayloadComparable {
  const payment = row.payment_method;
  return {
    type: row.type === "expense" ? "expense" : "income",
    title: typeof row.title === "string" ? row.title : "",
    quantity: Number(row.quantity ?? 0),
    unit_price: Number(row.unit_price ?? 0),
    total: Number(row.total ?? 0),
    transacted_at: toCanonicalIso(row.transacted_at),
    payment_method:
      payment === "cash" ||
      payment === "transfer" ||
      payment === "qris" ||
      payment === "ewallet"
        ? payment
        : null,
    notes: typeof row.notes === "string" ? row.notes : null,
  };
}

/** notes kosong ≡ null — keduanya berarti "tanpa catatan". */
function normalizeNotes(notes: string | null | undefined): string | null {
  const trimmed = typeof notes === "string" ? notes.trim() : "";
  return trimmed === "" ? null : trimmed;
}

/**
 * Apakah dua payload transaksi AI IDENTIK (penentu replay idempotency
 * saat request_id sama)?
 */
export function isSameAiPayload(
  a: AiPayloadComparable | null | undefined,
  b: AiPayloadComparable | null | undefined
): boolean {
  if (!a || !b) return false;

  const sameNumber = (x: unknown, y: unknown): boolean => {
    const nx = round2(Number(x));
    const ny = round2(Number(y));
    return Number.isFinite(nx) && Number.isFinite(ny) && nx === ny;
  };

  return (
    a.type === b.type &&
    (typeof a.title === "string" ? a.title.trim() : "") ===
      (typeof b.title === "string" ? b.title.trim() : "") &&
    sameNumber(a.quantity, b.quantity) &&
    sameNumber(a.unit_price, b.unit_price) &&
    sameNumber(a.total, b.total) &&
    a.transacted_at === b.transacted_at &&
    a.payment_method === b.payment_method &&
    normalizeNotes(a.notes) === normalizeNotes(b.notes)
  );
}
