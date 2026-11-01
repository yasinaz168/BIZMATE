import type { PaymentMethod, TransactionType } from "@/types";
import { jakartaTodayISO } from "@/lib/time";
import { isValidISODay } from "./filters";

/**
 * =====================================================================
 * VALIDATOR TRANSAKSI MANUAL (P5.4.4) — murni & isomorphic.
 * =====================================================================
 * - DIPAKAI SERVER (sumber kebenaran) dan CLIENT (pratinjau total saja):
 *   nilai akhir TETAP divalidasi ulang di server action — pratinjau
 *   browser hanya untuk kenyamanan UI.
 * - Angka dinormalisasi memakai aturan format Indonesia yang sama
 *   dengan validator AI (src/lib/ai/validate.ts): "75.000" → 75000,
 *   "1.500,5" → 1500.5. NaN/Infinity/string kosong/karakter asing → ditolak.
 * - Batas presisi mengikuti SCHema database (00001):
 *   quantity numeric(12,2), unit_price & total numeric(14,2).
 * - Total dihitung Di SINI (server dipercaya, browser tidak).
 */

/* Batas kolom database */
export const MAX_QUANTITY = 9999999999.99; // numeric(12,2)
export const MAX_MONEY = 999999999999.99; // numeric(14,2)

/** UUID (semua versi) — format kanonik 8-4-4-4-12 hex (pola pos/validate.ts) */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TRANSACTION_TYPES: readonly TransactionType[] = ["income", "expense"];

const PAYMENT_METHODS: readonly PaymentMethod[] = [
  "cash",
  "transfer",
  "qris",
  "ewallet",
];

/**
 * Normalisasi angka gaya Indonesia — perilaku identik dengan toNumber()
 * di src/lib/ai/validate.ts (format "Rp 1.250.000,75" → 1250000.75).
 */
export function parseIdNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : Number.NaN;
  if (typeof value !== "string") return Number.NaN;
  const cleaned = value
    .trim()
    .replace(/[^\d.,-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return Number.NaN;
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

/** Bulatkan ke 2 desimal (presisi numeric(…,2)). */
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export interface ManualTransactionRecord {
  type: TransactionType;
  title: string;
  quantity: number; // sudah dibulatkan 2 desimal
  unitPrice: number; // sudah dibulatkan 2 desimal
  /** dihitung SERVER: round2(quantity × unitPrice) */
  total: number;
  /** "yyyy-MM-dd" hari kalender Jakarta */
  transactedAtDay: string;
  /** ISO UTC — 12:00 WIB agar aman dari pergeseran hari */
  transactedAtIso: string;
  paymentMethod: PaymentMethod;
  notes: string;
  /**
   * Kunci idempotency (R2) — dibuat oleh KLIEN (server tidak membuat),
   * wajib UUID valid. Retry percobaan yang sama WAJIB memakai UUID yang
   * sama (pola identik request_id POS).
   */
  requestId: string;
}

export interface ManualValidationResult {
  valid: boolean;
  errors: string[];
  data: ManualTransactionRecord | null;
}

export function validateManualTransaction(raw: unknown): ManualValidationResult {
  const errors: string[] = [];
  const input = (raw ?? {}) as Record<string, unknown>;

  /* ---------- jenis ---------- */
  const type = input.type;
  if (typeof type !== "string" || !TRANSACTION_TYPES.includes(type as TransactionType)) {
    errors.push("Jenis transaksi wajib 'Pemasukan' atau 'Pengeluaran'.");
  }

  /* ---------- keterangan ---------- */
  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (title.length < 1) {
    errors.push("Keterangan transaksi wajib diisi.");
  } else if (title.length > 160) {
    errors.push("Keterangan transaksi maksimal 160 karakter.");
  }

  /* ---------- jumlah (quantity) ---------- */
  const quantity = round2(parseIdNumber(input.quantity));
  if (!Number.isFinite(quantity)) {
    errors.push("Jumlah wajib angka yang valid, lebih dari 0.");
  } else if (quantity <= 0) {
    errors.push("Jumlah harus lebih dari 0.");
  } else if (quantity > MAX_QUANTITY) {
    errors.push("Jumlah melebihi batas maksimal.");
  }

  /* ---------- harga satuan ---------- */
  const unitPrice = round2(parseIdNumber(input.unitPrice));
  if (!Number.isFinite(unitPrice)) {
    errors.push("Harga per satuan wajib angka yang valid, tidak negatif.");
  } else if (unitPrice < 0) {
    errors.push("Harga per satuan tidak boleh negatif.");
  } else if (unitPrice > MAX_MONEY) {
    errors.push("Harga per satuan melebihi batas maksimal.");
  }

  /* ---------- total (SERVER di sini, bukan dari browser) ---------- */
  let total = 0;
  if (Number.isFinite(quantity) && Number.isFinite(unitPrice)) {
    total = round2(quantity * unitPrice);
    if (total > MAX_MONEY) {
      errors.push("Total transaksi melebihi batas database.");
    }
  }

  /* ---------- metode pembayaran ---------- */
  const rawPayment = input.paymentMethod;
  let paymentMethod: PaymentMethod | null = null;
  if (
    typeof rawPayment === "string" &&
    PAYMENT_METHODS.includes(rawPayment as PaymentMethod)
  ) {
    paymentMethod = rawPayment as PaymentMethod;
  } else {
    errors.push("Metode pembayaran tidak valid.");
  }

  /* ---------- tanggal kalender Jakarta ---------- */
  let transactedDay = "";
  const rawDate = input.transactedAt;
  if (typeof rawDate === "string" && isValidISODay(rawDate)) {
    if (rawDate > jakartaTodayISO()) {
      errors.push("Tanggal transaksi tidak boleh di masa depan.");
    }
    transactedDay = rawDate;
  } else {
    errors.push("Tanggal transaksi tidak valid.");
  }

  /* ---------- catatan ---------- */
  const notes = typeof input.notes === "string" ? input.notes.trim() : "";
  if (notes.length > 500) {
    errors.push("Catatan maksimal 500 karakter.");
  }

  /* ---------- request_id (idempotency R2 — wajib, UUID valid) ---------- */
  // Dibuat oleh klien (server TIDAK membuat); pola & pesan identik dengan
  // validasi request_id POS (src/lib/pos/validate.ts).
  const requestId =
    typeof input.requestId === "string" ? input.requestId.trim() : "";
  if (!requestId) {
    errors.push("request_id wajib diisi.");
  } else if (!UUID_RE.test(requestId)) {
    errors.push("request_id harus berupa UUID yang valid.");
  }

  if (errors.length > 0) {
    return { valid: false, errors, data: null };
  }
  // TypeScript tidak dapat menyimpikan hasil dari pemeriksaan bentuk
  // di atas — setiap nilai SUDAH terjaga oleh cabang kondisional, walau
  // masih diperiksa defensif di sini.
  if (
    (type !== "income" && type !== "expense") ||
    paymentMethod === null ||
    !isValidISODay(transactedDay)
  ) {
    return { valid: false, errors: ["Data transaksi belum lengkap."], data: null };
  }

  return {
    valid: true,
    errors: [],
    data: {
      type,
      title,
      quantity,
      unitPrice,
      total,
      transactedAtDay: transactedDay,
      transactedAtIso: new Date(`${transactedDay}T12:00:00+07:00`).toISOString(),
      paymentMethod,
      notes,
      requestId,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Pembanding payload (R2 — idempotency)                                */
/* ------------------------------------------------------------------ */

/**
 * Bentuk minimal payload untuk pembandingan replay: sama dengan hasil
 * validator ternormalisasi (ManualTransactionRecord memenuhi bentuk ini).
 * Baris DB bisa dipetakan dulu ke bentuk ini oleh pemanggil (R2.2).
 */
export interface ManualPayloadComparable {
  type: TransactionType;
  title: string;
  quantity: number;
  unitPrice: number;
  total: number;
  /** ISO UTC — setara dengan transactedAtDay (hari 12:00 WIB) */
  transactedAtIso: string;
  paymentMethod: PaymentMethod | null;
  notes: string | null;
}

/** notes kosong ≡ null — keduanya berarti "tanpa catatan". */
function normalizeNotes(notes: string | null | undefined): string | null {
  const trimmed = typeof notes === "string" ? notes.trim() : "";
  return trimmed === "" ? null : trimmed;
}

/**
 * Apakah dua payload transaksi manual IDENTIK? (untuk menentukan replay
 * idempotency saat request_id sama).
 *
 * - Angka dibandingkan via Number() + round2 pada NILAI ternormalisasi
 *   (hasil validator / baris DB) — desimal-safe ("5.00" → 5), BUKAN input
 *   mentah pengguna.
 * - notes kosong/null/space ≡ sama; notes berisi → harus persis sama
 *   (setelah trim — normalisasi validator).
 * - title dibandingkan setelah trim (normalisasi validator).
 * - Tidak membandingkan request_id (memang sama untuk kasus ini).
 */
export function isSameManualPayload(
  a: ManualPayloadComparable | null | undefined,
  b: ManualPayloadComparable | null | undefined
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
    sameNumber(a.unitPrice, b.unitPrice) &&
    sameNumber(a.total, b.total) &&
    a.transactedAtIso === b.transactedAtIso &&
    a.paymentMethod === b.paymentMethod &&
    normalizeNotes(a.notes) === normalizeNotes(b.notes)
  );
}
