import type { ProductInput } from "@/types";

/**
 * VALIDATOR PRODUK — Tahap P1 (Product Management Foundation).
 *
 * Prinsip (konsisten dengan src/lib/ai/validate.ts):
 * - Tidak ada yang lolos tanpa diperiksa di SERVER.
 * - Angka dinormalisasi aman: TIDAK menerima NaN/Infinity.
 * - Harga dibulatkan maksimal 2 angka desimal (sesuai kolom numeric(14,2)).
 * - Field yang tidak terisi opsional menjadi null — tidak ditebak.
 * - Kembalikan daftar error dalam Bahasa Indonesia.
 *
 * Format angka string yang didukung:
 * - Format Indonesia: "75.000" (ribuan) dan "75,5" (desimal koma)
 * - Format standar input number: "75000.5" (desimal titik, ≤2 desimal)
 * - Angka murni (typeof number) diterima apa adanya bila finite.
 */

export interface ProductValidationResult {
  valid: boolean;
  errors: string[];
  data: ProductInput | null;
}

/** Panjang nama maksimal — mengikuti CHECK btrim(name) 1..160 di tabel products */
export const PRODUCT_NAME_MAX = 160;
/** Panjang kategori maksimal — mengikuti konvensi businesses.category (1..80) */
export const PRODUCT_CATEGORY_MAX = 80;
/** Panjang satuan yang wajar (kolom free text, dibatasi aplikasi) */
export const PRODUCT_UNIT_MAX = 40;
/** Nilai numerik maksimum yang muat di kolom numeric(14,2) */
export const NUMERIC_MAX = 999999999999.99;

/**
 * Pola string angka yang diterima:
 * - "1.234.567"          (ribuan titik)
 * - "1.234,56"           (ribuan titik + desimal koma)
 * - "75,5"               (desimal koma)
 * - "75000.5" / "75.50"  (desimal titik, maksimal 2 angka desimal)
 * - "75000"              (bilangan bulat)
 * Semuanya boleh diawali tanda minus (untuk membedakan "negatif"
 * dari "format salah" — nilai negatif tetap ditolak untuk harga/stok).
 */
const NUMERIC_STRING_RE =
  /^-?(?:\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?|\d+\.\d{1,2})$/;

/** Bulatkan maksimal 2 angka desimal (sesuai numeric(14,2)) */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Normalisasi string angka → number. Mengembalikan NaN bila format tidak
 * valid — pemanggil yang mengubahnya menjadi pesan error (tidak menebak).
 */
function parseNumericString(raw: string): number {
  const trimmed = raw.trim();
  if (!NUMERIC_STRING_RE.test(trimmed)) return Number.NaN;

  const negative = trimmed.startsWith("-");
  const body = negative ? trimmed.slice(1) : trimmed;

  let normalized: string;
  if (body.includes(",")) {
    // Format Indonesia: titik = pemisah ribuan, koma = desimal
    normalized = body.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(?:\.\d{3})+$/.test(body)) {
    // Ribuan bertitik tanpa desimal: "75.000" → 75000
    normalized = body.replace(/\./g, "");
  } else {
    // Desimal titik standar atau bilangan bulat
    normalized = body;
  }

  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed)) return Number.NaN;
  return negative ? -parsed : parsed;
}

/** Normalisasi nilai angka dari input apa pun — aman dari NaN/Infinity */
function parseNumber(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : Number.NaN;
  }
  if (typeof value === "string") {
    return parseNumericString(value);
  }
  return Number.NaN;
}

/** Normalisasi teks opsional: trim; kosong/non-teks → error atau null */
function parseOptionalText(
  value: unknown,
  label: string,
  max: number,
  errors: string[]
): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") {
    errors.push(`${label} harus berupa teks.`);
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > max) {
    errors.push(`${label} maksimal ${max} karakter.`);
    return null;
  }
  return trimmed;
}

/**
 * Validasi & normalisasi input produk.
 *
 * Menerima input mentah (mis. dari FormData) berupa objek dengan field:
 * name, category, selling_price, unit_cost, stock, unit, is_active.
 * Mengembalikan `data` ProductInput yang sudah dinormalisasi bila valid,
 * atau daftar error Bahasa Indonesia bila tidak.
 */
export function validateProduct(raw: unknown): ProductValidationResult {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { valid: false, errors: ["Data produk tidak valid."], data: null };
  }
  const input = raw as Record<string, unknown>;
  const errors: string[] = [];

  // ---------- name (wajib, 1..160 setelah trim) ----------
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (name.length < 1) {
    errors.push("Nama produk wajib diisi.");
  } else if (name.length > PRODUCT_NAME_MAX) {
    errors.push(`Nama produk maksimal ${PRODUCT_NAME_MAX} karakter.`);
  }

  // ---------- category (opsional, maksimal 80) ----------
  const category = parseOptionalText(
    input.category,
    "Kategori produk",
    PRODUCT_CATEGORY_MAX,
    errors
  );

  // ---------- selling_price (wajib, >= 0) ----------
  let sellingPrice = Number.NaN;
  if (input.selling_price === null || input.selling_price === undefined || input.selling_price === "") {
    errors.push("Harga jual wajib diisi.");
  } else {
    sellingPrice = parseNumber(input.selling_price);
    if (!Number.isFinite(sellingPrice)) {
      errors.push("Harga jual wajib angka yang valid.");
    } else if (sellingPrice < 0) {
      errors.push("Harga jual tidak boleh negatif.");
    } else if (sellingPrice > NUMERIC_MAX) {
      errors.push("Harga jual melebihi batas maksimum 999.999.999.999,99.");
    }
  }

  // ---------- unit_cost (opsional, >= 0) ----------
  let unitCost: number | null = null;
  if (input.unit_cost !== null && input.unit_cost !== undefined && input.unit_cost !== "") {
    const parsed = parseNumber(input.unit_cost);
    if (!Number.isFinite(parsed)) {
      errors.push("Harga modal wajib angka yang valid.");
    } else if (parsed < 0) {
      errors.push("Harga modal tidak boleh negatif.");
    } else if (parsed > NUMERIC_MAX) {
      errors.push("Harga modal melebihi batas maksimum 999.999.999.999,99.");
    } else {
      unitCost = round2(parsed);
    }
  }

  // ---------- stock (opsional, >= 0) ----------
  let stock: number | null = null;
  if (input.stock !== null && input.stock !== undefined && input.stock !== "") {
    const parsed = parseNumber(input.stock);
    if (!Number.isFinite(parsed)) {
      errors.push("Stok wajib angka yang valid.");
    } else if (parsed < 0) {
      errors.push("Stok tidak boleh negatif.");
    } else if (parsed > NUMERIC_MAX) {
      errors.push("Stok melebihi batas maksimum 999.999.999.999,99.");
    } else {
      stock = round2(parsed);
    }
  }

  // ---------- unit (opsional, panjang wajar) ----------
  const unit = parseOptionalText(input.unit, "Satuan produk", PRODUCT_UNIT_MAX, errors);

  // ---------- is_active (opsional, default true) ----------
  let isActive = true;
  if (input.is_active !== undefined && input.is_active !== null) {
    if (input.is_active === true || input.is_active === "true") {
      isActive = true;
    } else if (input.is_active === false || input.is_active === "false") {
      isActive = false;
    } else {
      errors.push("Status aktif produk tidak valid.");
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors, data: null };
  }

  return {
    valid: true,
    errors: [],
    data: {
      name,
      category,
      selling_price: round2(sellingPrice),
      unit_cost: unitCost,
      stock,
      unit,
      is_active: isActive,
    },
  };
}
