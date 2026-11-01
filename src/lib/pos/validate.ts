import type { CartItem, CheckoutInput, PaymentMethod } from "@/types";

/**
 * VALIDATOR CHECKOUT POS — Tahap P5.1.
 *
 * Prinsip (konsisten dengan src/lib/ai/validate.ts & products/validate.ts):
 * - Validasi sisi SERVER — bukan pengganti validasi browser/database.
 * - Hanya memvalidasi apa yang diperbolehkan datang dari klien:
 *   request_id, payment_method, items (product_id + quantity), notes.
 * - TIDAK menerima & TIDAK memakai: business_id, selling_price,
 *   product_name, subtotal/total dari klien — semuanya ditentukan
 *   oleh RPC create_sale dari tabel database (sumber kebenaran).
 * - Angka dinormalisasi aman: TIDAK menerima NaN/Infinity.
 * - Quantity dibulatkan maksimal 2 desimal (numeric(12,2)) dan tetap
 *   wajib > 0 SETELAH pembulatan.
 * - Kembalikan daftar error dalam Bahasa Indonesia.
 *
 * CATATAN: duplikat product_id pada keranjang tidak ditolak di sini —
 * RPC create_sale mengagregasikannya secara deterministik (bukti:
 * migration 00005, bagian agregasi item).
 */

export interface CheckoutValidationResult {
  valid: boolean;
  errors: string[];
  data: CheckoutInput | null;
}

/** Maksimal item per checkout — mengikuti RPC create_sale (migration 00005) */
export const MAX_CHECKOUT_ITEMS = 100;
/** Quantity maksimum — mengikuti kolom numeric(12,2) transactions/transaction_items */
export const QUANTITY_MAX = 9999999999.99;
/** Panjang catatan maksimal — mengikuti RPC create_sale */
export const NOTES_MAX = 500;

const PAYMENT_METHODS: readonly PaymentMethod[] = [
  "cash",
  "transfer",
  "qris",
  "ewallet",
];

/** UUID (semua versi) — format kanonik 8-4-4-4-12 hex */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Pola string angka yang diterima (konsisten dengan products/validate.ts):
 * - "1.234.567" (ribuan titik) · "1.234,56" (ribuan + desimal koma)
 * - "75,5" (desimal koma) · "75000.5" (desimal titik, ≤2 desimal)
 * - "75000" (bulat) — boleh diawali tanda minus (untuk membedakan
 *   "negatif" dari "format salah").
 */
const NUMERIC_STRING_RE =
  /^-?(?:\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?|\d+\.\d{1,2})$/;

/** Bulatkan maksimal 2 angka desimal */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Normalisasi string angka → number; NaN bila format tidak valid */
function parseNumericString(raw: string): number {
  const trimmed = raw.trim();
  if (!NUMERIC_STRING_RE.test(trimmed)) return Number.NaN;

  const negative = trimmed.startsWith("-");
  const body = negative ? trimmed.slice(1) : trimmed;

  let normalized: string;
  if (body.includes(",")) {
    normalized = body.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(?:\.\d{3})+$/.test(body)) {
    normalized = body.replace(/\./g, "");
  } else {
    normalized = body;
  }

  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed)) return Number.NaN;
  return negative ? -parsed : parsed;
}

/** Normalisasi nilai quantity dari input apa pun — aman dari NaN/Infinity */
function parseQuantity(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : Number.NaN;
  }
  if (typeof value === "string") {
    return parseNumericString(value);
  }
  return Number.NaN;
}

/**
 * Validasi & normalisasi input checkout POS.
 *
 * Menerima objek mentah (mis. hasil FormData/JSON klien) berisi:
 * request_id, payment_method, items, notes.
 * Mengembalikan `data` CheckoutInput yang sudah dinormalisasi bila valid,
 * atau daftar error Bahasa Indonesia bila tidak.
 */
export function validateCheckout(raw: unknown): CheckoutValidationResult {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { valid: false, errors: ["Data checkout tidak valid."], data: null };
  }
  const input = raw as Record<string, unknown>;
  const errors: string[] = [];

  // ---------- request_id (wajib, UUID valid) ----------
  const requestId = typeof input.request_id === "string" ? input.request_id.trim() : "";
  if (requestId.length === 0) {
    errors.push("request_id wajib diisi.");
  } else if (!UUID_RE.test(requestId)) {
    errors.push("request_id harus berupa UUID yang valid.");
  }

  // ---------- payment_method (wajib, salah satu dari 4 nilai) ----------
  const rawPayment =
    typeof input.payment_method === "string"
      ? input.payment_method.trim()
      : input.payment_method;
  if (rawPayment === null || rawPayment === undefined || rawPayment === "") {
    errors.push("Metode pembayaran wajib diisi.");
  } else if (!PAYMENT_METHODS.includes(rawPayment as PaymentMethod)) {
    errors.push("Metode pembayaran tidak valid.");
  }

  // ---------- items (array, 1..100, product_id UUID + quantity valid) ----------
  let items: CartItem[] = [];
  const rawItems = input.items;
  if (!Array.isArray(rawItems)) {
    errors.push("Daftar item harus berupa array.");
  } else if (rawItems.length < 1) {
    errors.push("Keranjang belanja kosong.");
  } else if (rawItems.length > MAX_CHECKOUT_ITEMS) {
    errors.push(`Maksimal ${MAX_CHECKOUT_ITEMS} item dalam satu transaksi.`);
  } else {
    for (let i = 0; i < rawItems.length; i++) {
      const raw = rawItems[i];
      const label = `Item ke-${i + 1}`;
      if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
        errors.push(`${label} tidak valid.`);
        continue;
      }
      const item = raw as Record<string, unknown>;

      const productId = typeof item.product_id === "string" ? item.product_id.trim() : "";
      if (productId.length === 0) {
        errors.push(`${label}: product_id wajib diisi.`);
      } else if (!UUID_RE.test(productId)) {
        errors.push(`${label}: product_id harus berupa UUID yang valid.`);
      }

      let quantity = parseQuantity(item.quantity);
      if (!Number.isFinite(quantity)) {
        errors.push(`${label}: quantity wajib angka yang valid.`);
        continue;
      }
      if (quantity > QUANTITY_MAX) {
        errors.push(`${label}: quantity melebihi batas.`);
        continue;
      }
      quantity = round2(quantity);
      if (!(quantity > 0)) {
        errors.push(`${label}: quantity harus lebih besar dari 0.`);
        continue;
      }

      items.push({ product_id: productId, quantity });
    }
  }

  // ---------- notes (opsional: null / string ≤ 500) ----------
  let notes: string | null = null;
  if (input.notes !== null && input.notes !== undefined) {
    if (typeof input.notes !== "string") {
      errors.push("Catatan harus berupa teks.");
    } else {
      const trimmed = input.notes.trim();
      if (trimmed.length > NOTES_MAX) {
        errors.push(`Catatan maksimal ${NOTES_MAX} karakter.`);
      } else if (trimmed.length > 0) {
        notes = trimmed;
      }
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors, data: null };
  }

  return {
    valid: true,
    errors: [],
    data: {
      request_id: requestId,
      payment_method: rawPayment as PaymentMethod,
      items,
      notes,
    },
  };
}
