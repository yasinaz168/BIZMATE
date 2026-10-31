import {
  needsReviewField,
  readField,
  unreadField,
  type OcrImageInput,
  type OcrProvider,
  type OcrProviderResult,
  type ReceiptDraft,
  type ReceiptOcrResult,
} from "./types";

/**
 * MOCK OCR — Mode Simulasi (tanda: OCR_API_KEY belum diisi).
 *
 * ATURAN KEJUJURAN (tidak boleh dilanggar):
 * - Hasil SELALU ditandai simulation: true + label teks "SIMULASI".
 *   Tidak boleh ada klaim bahwa ini hasil pembacaan foto sungguhan.
 * - Data adalah CONTOH TETAP (deterministik untuk pengujian), bukan
 *   hasil membaca `image` apa pun — gambar yang masuk diabaikan.
 * - Field yang tidak terbaca tetap null/"unread", tidak ditebak.
 */

export const MOCK_SIMULATION_LABEL =
  "SIMULASI — data contoh, bukan hasil pembacaan foto sungguhan.";

/** Teks mentah contoh nota — selalu diberi kepala SIMULASI yang jelas */
export const MOCK_RAW_TEXT = `[SIMULASI — CONTOH DATA, BUKAN HASIL PEMBACAAN FOTO]
NOTA TOKO BERKAH JAYA
Jl. Merdeka No. 12, Bandung
------------------------------
Kopi Arabica 250gr      2 x 45000
Gula Aren 500gr         1 x 25000
Susu UHT 1L            3 x 1?000
------------------------------
TOTAL                     165000
`;

/**
 * Draft contoh yang mendemonstrasikan seluruh status field:
 * - "read"          : terbaca jelas
 * - "needs_review"  : terbaca tetapi diragukan (harga "1?000")
 * - "unread"        : tidak terbaca → null (tanggal & subtotal baris ragu)
 */
export function buildMockReceiptDraft(): ReceiptDraft {
  return {
    shop_name: readField("Toko Berkah Jaya"),
    transacted_at: unreadField<string>(), // tanggal tidak tercetak pada contoh
    items: [
      {
        name: readField("Kopi Arabica 250gr"),
        quantity: readField(2),
        unit_price: readField(45000),
        total: readField(90000),
      },
      {
        name: readField("Gula Aren 500gr"),
        quantity: readField(1),
        unit_price: readField(25000),
        total: readField(25000),
      },
      {
        name: readField("Susu UHT 1L"),
        quantity: readField(3),
        // harga terbaca tidak jelas ("1?000") → diragukan, bukan ditebak
        unit_price: needsReviewField(1000),
        // subtotal tidak pasti karena harga tidak pasti → tidak ditebak
        total: unreadField<number>(),
      },
    ],
    total: readField(165000),
  };
}

/** Hasil lengkap Mode Simulasi — siap ditampilkan sebagai draft berlabel */
export function buildMockReceiptOcrResult(): ReceiptOcrResult {
  return {
    provider: "mock",
    simulation: true,
    rawText: MOCK_RAW_TEXT,
    draft: buildMockReceiptDraft(),
    warnings: [
      MOCK_SIMULATION_LABEL,
      "Tanggal nota tidak terbaca — lengkapi sebelum menyimpan.",
      "Harga 'Susu UHT 1L' diragukan — periksa kembali.",
    ],
  };
}

/** Provider mock — mengabaikan gambar, selalu mengembalikan data contoh */
export const mockOcrProvider: OcrProvider = {
  name: "mock",
  simulation: true,
  async recognize(_image: OcrImageInput): Promise<OcrProviderResult> {
    return {
      provider: "mock",
      simulation: true,
      rawText: MOCK_RAW_TEXT,
      confidence: null, // simulasi tidak punya keyakinan pembacaan sungguhan
    };
  },
};
