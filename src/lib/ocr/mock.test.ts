import { describe, expect, it } from "vitest";
import {
  buildMockReceiptDraft,
  buildMockReceiptOcrResult,
  mockOcrProvider,
  MOCK_RAW_TEXT,
  MOCK_SIMULATION_LABEL,
} from "./mock";

/**
 * Pengujian MOCK OCR (Tahap 1).
 *
 * Dijaga:
 * - Mock SELALU berlabel SIMULASI — tidak pernah mengaku sebagai hasil
 *   pembacaan foto sungguhan.
 * - Field tidak terbaca → null ("unread"), field diragukan → "needs_review".
 * - Modul OCR TIDAK PERNAH menyimpan transaksi apa pun (hanya menghasilkan
 *   draft) — diverifikasi dengan memastikan tidak ada operasi simpan.
 */

describe("mock mode — selalu berlabel SIMULASI", () => {
  it("provider mock menyatakan dirinya simulasi", () => {
    expect(mockOcrProvider.simulation).toBe(true);
    expect(mockOcrProvider.name).toBe("mock");
  });

  it("hasil lengkap berstatus simulation: true dan membawa label kejujuran", () => {
    const result = buildMockReceiptOcrResult();
    expect(result.simulation).toBe(true);
    expect(result.provider).toBe("mock");
    expect(result.warnings).toContain(MOCK_SIMULATION_LABEL);
    expect(result.warnings.join(" ")).toContain("SIMULASI");
  });

  it("teks mentah diawali label SIMULASI yang jelas", () => {
    expect(MOCK_RAW_TEXT.startsWith("[SIMULASI")).toBe(true);
    expect(MOCK_RAW_TEXT).toContain("BUKAN HASIL PEMBACAAN FOTO");
  });

  it("recognize() selalu mengembalikan hasil simulasi berlabel, apa pun gambarnya", async () => {
    const a = await mockOcrProvider.recognize({
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: "image/png",
    });
    const b = await mockOcrProvider.recognize({
      bytes: new Uint8Array([9, 9, 9, 9]),
      mimeType: "image/jpeg",
      fileName: "nota-lain.jpg",
    });
    for (const r of [a, b]) {
      expect(r.simulation).toBe(true);
      expect(r.provider).toBe("mock");
      expect(r.rawText.startsWith("[SIMULASI")).toBe(true);
    }
    // Mock tidak "membaca" gambar — hasil deterministik untuk pengujian
    expect(a.rawText).toBe(b.rawText);
    expect(a.confidence).toBeNull(); // simulasi tidak punya keyakinan sungguhan
  });
});

describe("mock mode — field kosong/tidak terbaca", () => {
  it("field tidak terbaca bernilai null dengan status 'unread' — tidak ditebak", () => {
    const draft = buildMockReceiptDraft();
    expect(draft.transacted_at.value).toBeNull();
    expect(draft.transacted_at.status).toBe("unread");
  });

  it("field yang diragukan ditandai 'needs_review' dengan nilai apa adanya", () => {
    const draft = buildMockReceiptDraft();
    const susu = draft.items.find((i) => i.name.value === "Susu UHT 1L");
    expect(susu).toBeDefined();
    expect(susu!.unit_price.status).toBe("needs_review");
    expect(susu!.unit_price.value).toBe(1000);
    // subtotal baris yang tidak pasti → unread/null, bukan hasil karangan
    expect(susu!.total.status).toBe("unread");
    expect(susu!.total.value).toBeNull();
  });

  it("field terbaca jelas berstatus 'read' dengan nilai lengkap", () => {
    const draft = buildMockReceiptDraft();
    expect(draft.shop_name).toEqual({ value: "Toko Berkah Jaya", status: "read" });
    expect(draft.total).toEqual({ value: 165000, status: "read" });
    const kopi = draft.items.find((i) => i.name.value === "Kopi Arabica 250gr");
    expect(kopi!.quantity).toEqual({ value: 2, status: "read" });
    expect(kopi!.unit_price).toEqual({ value: 45000, status: "read" });
    expect(kopi!.total).toEqual({ value: 90000, status: "read" });
  });

  it("tidak ada field unread yang menyimpan nilai karangan", () => {
    const draft = buildMockReceiptDraft();
    const allFields = [
      draft.shop_name,
      draft.transacted_at,
      draft.total,
      ...draft.items.flatMap((i) => [i.name, i.quantity, i.unit_price, i.total]),
    ];
    for (const f of allFields) {
      if (f.status === "unread") expect(f.value).toBeNull();
    }
  });
});

describe("modul OCR tidak menyimpan transaksi", () => {
  it("mock hanya menghasilkan draft — tidak ada id/status penyimpanan di hasil", async () => {
    const result = buildMockReceiptOcrResult();
    const providerResult = await mockOcrProvider.recognize({
      bytes: new Uint8Array([1]),
      mimeType: "image/png",
    });
    // Hasil OCR tidak memuat penanda transaksi tersimpan apa pun
    const flat = JSON.stringify({ result, providerResult });
    expect(flat).not.toMatch(/transactionId|"saved"|transacted_at_iso/);
  });

  it("objek hasil tidak memuat field id transaksi (draf murni)", () => {
    const result = buildMockReceiptOcrResult();
    expect(result).not.toHaveProperty("id");
    expect(result.draft).not.toHaveProperty("id");
  });
});
