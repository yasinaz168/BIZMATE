import { buildMockReceiptDraft, MOCK_SIMULATION_LABEL } from "./mock";
import {
  unreadField,
  type OcrProviderResult,
  type ReceiptDraft,
  type ReceiptItem,
  type ReceiptOcrResult,
} from "./types";

/**
 * PENYUSUNAN STRUKTUR NOTA — Stage C (Server API Foundation).
 *
 * Mengubah hasil mentah provider (OcrProviderResult → teks bacaan) menjadi
 * ReceiptOcrResult (draft terstruktur + label kejujuran).
 *
 * Prinsip yang dijaga (JANGAN PERNAH dilanggar):
 * - Bila gambar TIDAK terbaca (teks kosong) → SEMUA field berstatus "unread"
 *   (null). TIDAK mengarang data apa pun.
 * - Mode Simulasi (mock) → draft contoh yang JUJUR diberi label SIMULASI.
 * - Provider nyata tanpa penyusun struktur → draft "unread" + warning jujur,
 *   BUKAN hasil karangan.
 * - Modul ini TIDAK PERNAH menyimpan transaksi — hanya menghasilkan draft.
 */

/** Draft dengan semua field "unread" — dipakai saat tidak ada yang terbaca */
export function buildUnreadReceiptDraft(): ReceiptDraft {
  const unreadItem = (): ReceiptItem => ({
    name: unreadField<string>(),
    quantity: unreadField<number>(),
    unit_price: unreadField<number>(),
    total: unreadField<number>(),
  });
  return {
    shop_name: unreadField<string>(),
    transacted_at: unreadField<string>(),
    items: [unreadItem()],
    total: unreadField<number>(),
  };
}

const UNREAD_WARNING =
  "Gambar tidak terbaca atau tidak ada teks yang terdeteksi — semua field dikosongkan (unread). Silakan isi manual, sistem tidak menebak data.";

/**
 * Susun ReceiptOcrResult dari hasil mentah provider.
 * Murni fungsi transformasi — tidak menyimpan apa pun.
 */
export function structureReceipt(raw: OcrProviderResult): ReceiptOcrResult {
  // 1) Tidak ada teks terbaca → semua unread, jangan mengarang
  if (!raw.rawText || raw.rawText.trim().length === 0) {
    return {
      provider: raw.provider,
      simulation: raw.simulation,
      rawText: raw.rawText,
      draft: buildUnreadReceiptDraft(),
      warnings: [UNREAD_WARNING],
    };
  }

  // 2) Mode Simulasi (mock) → draft contoh yang jujur berlabel SIMULASI
  if (raw.simulation) {
    return {
      provider: raw.provider,
      simulation: true,
      rawText: raw.rawText,
      draft: buildMockReceiptDraft(),
      warnings: [
        MOCK_SIMULATION_LABEL,
        "Ini adalah data contoh untuk pengembangan — bukan hasil pembacaan foto sungguhan.",
      ],
    };
  }

  // 3) Provider nyata tetapi penyusun struktur otomatis belum aktif
  //    (LLM parser menyusul di tahap berikutnya) → draft unread + warning jujur,
  //    BUKAN hasil karangan.
  return {
    provider: raw.provider,
    simulation: false,
    rawText: raw.rawText,
    draft: buildUnreadReceiptDraft(),
    warnings: [
      "Penyusunan struktur otomatis belum aktif — hasil bacaan mentah tersedia di rawText, mohon periksa dan isi manual.",
    ],
  };
}
