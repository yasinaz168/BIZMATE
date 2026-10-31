/**
 * KONTRAK DATA OCR — Tahap 1 (OCR Foundation).
 *
 * Prinsip yang dijaga (konsisten dengan AI Chat di src/lib/ai/types.ts):
 * - Modul OCR TIDAK PERNAH menyimpan transaksi. Hasilnya hanya DRAFT
 *   (ReceiptOcrResult) yang harus diperiksa & dikonfirmasi pengguna
 *   sebelum disimpan lewat jalur simpan yang sudah ada.
 * - Field yang tidak terbaca / tidak tersedia bernilai null dan berstatus
 *   "unread" — TIDAK BOLEH ditebak oleh OCR maupun AI.
 *
 * Alur ke depan (Tahap 2+): OcrProvider menghasilkan teks mentah
 * (OcrProviderResult), lalu tahap penyusunan struktur (LLM/parser)
 * mengubahnya menjadi ReceiptDraft → ReceiptOcrResult.
 */

/** Status pembacaan sebuah field oleh OCR */
export type OcrFieldStatus =
  /** terbaca jelas */
  | "read"
  /** terbaca tetapi diragukan — pengguna WAJIB memeriksa */
  | "needs_review"
  /** tidak terbaca / tidak ada di nota — nilai null, jangan ditebak */
  | "unread";

/**
 * Satu nilai hasil ekstraksi beserta status pembacaannya.
 * Invarian: bila status "unread" maka value harus null.
 */
export interface OcrField<T> {
  /** null = tidak terbaca/tidak tersedia — TIDAK PERNAH diganti nilai karangan */
  value: T | null;
  status: OcrFieldStatus;
}

/** Field terbaca jelas */
export function readField<T>(value: T): OcrField<T> {
  return { value, status: "read" };
}

/** Field terbaca tetapi diragukan — tetap ditampilkan untuk diperiksa */
export function needsReviewField<T>(value: T): OcrField<T> {
  return { value, status: "needs_review" };
}

/** Field tidak terbaca — null, bukan tebakan */
export function unreadField<T>(): OcrField<T> {
  return { value: null, status: "unread" };
}

/**
 * Satu baris item pada nota.
 * Pemetaan ke tabel transaction_items kelak:
 * name → product_name, total → total (subtotal baris).
 */
export interface ReceiptItem {
  /** nama produk/jasa */
  name: OcrField<string>;
  quantity: OcrField<number>;
  unit_price: OcrField<number>;
  /** subtotal baris — SAAT MENYIMPAN tetap dihitung ulang di server */
  total: OcrField<number>;
}

/**
 * Draft nota hasil ekstraksi — BELUM transaksi.
 * Pemetaan ke tabel transactions kelak:
 * transacted_at → transacted_at, total → total.
 */
export interface ReceiptDraft {
  /** nama toko/merchant pada nota */
  shop_name: OcrField<string>;
  /** "YYYY-MM-DD" (kalender Jakarta) bila terbaca */
  transacted_at: OcrField<string>;
  items: ReceiptItem[];
  /** total keseluruhan yang tercetak pada nota */
  total: OcrField<number>;
}

/** Hasil mentah dari provider OCR (teks bacaan, belum terstruktur) */
export interface OcrProviderResult {
  /** nama provider, mis. "mock", "google-vision" */
  provider: string;
  /** true = MODE SIMULASI — bukan hasil pembacaan foto sungguhan */
  simulation: boolean;
  /** teks mentah hasil pembacaan (untuk ditampilkan/transparansi) */
  rawText: string;
  /** keyakinan pembacaan 0..1; null bila provider tidak memberikannya */
  confidence: number | null;
}

/**
 * Hasil lengkap fitur foto nota yang diserahkan ke UI/pengguna:
 * draft terstruktur + teks mentah + label kejujuran.
 */
export interface ReceiptOcrResult {
  provider: string;
  /** true = MODE SIMULASI — WAJIB ditampilkan sebagai label di UI */
  simulation: boolean;
  rawText: string;
  draft: ReceiptDraft;
  /** catatan kejujuran, mis. label simulasi & field yang perlu diperiksa */
  warnings: string[];
}

/** Gambar nota yang diterima dari pengguna (diolah di server) */
export interface OcrImageInput {
  bytes: Uint8Array;
  /** mime type, mis. "image/jpeg", "image/png" */
  mimeType: string;
  fileName?: string;
}

/**
 * Kontrak provider OCR. Implementasi nyata (Google Cloud Vision, dll.)
 * cukup memenuhi interface ini untuk bisa didaftarkan ke registry.
 */
export interface OcrProvider {
  readonly name: string;
  /**
   * true = hasil SELALU simulasi dan wajib diberi label.
   * Provider nyata harus false — jangan pernah mengklaim simulasi
   * sebagai hasil pembacaan sungguhan, maupun sebaliknya.
   */
  readonly simulation: boolean;
  recognize(image: OcrImageInput): Promise<OcrProviderResult>;
}
