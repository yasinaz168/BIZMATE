import { describe, expect, it } from "vitest";
import { buildUnreadReceiptDraft, structureReceipt } from "./structure";
import { MOCK_SIMULATION_LABEL } from "./mock";
import type { OcrProviderResult, ReceiptDraft } from "./types";

/**
 * Pengujian penyusunan struktur nota (Stage C).
 *
 * Dijaga:
 * - Gambar tidak terbaca → SEMUA field "unread" (null), TIDAK mengarang.
 * - Mode Simulasi → draft berlabel SIMULASI.
 * - Provider nyata tanpa penyusun struktur → unread + warning jujur.
 */

function collectFields(draft: ReceiptDraft): Array<{ value: unknown; status: string }> {
  return [
    draft.shop_name,
    draft.transacted_at,
    draft.total,
    ...draft.items.flatMap((i) => [i.name, i.quantity, i.unit_price, i.total]),
  ];
}

const RAW_SIM: OcrProviderResult = {
  provider: "mock",
  simulation: true,
  rawText: "[SIMULASI] ...",
  confidence: null,
};

describe("structureReceipt — gambar tidak terbaca", () => {
  it("teks kosong → semua field unread, tidak ada nilai karangan", () => {
    const result = structureReceipt({
      provider: "mock",
      simulation: true,
      rawText: "",
      confidence: null,
    });
    for (const f of collectFields(result.draft)) {
      expect(f.status).toBe("unread");
      expect(f.value).toBeNull();
    }
    expect(result.warnings.join(" ")).toContain("tidak terbaca");
  });

  it("teks hanya spasi → tetap dianggap tidak terbaca", () => {
    const result = structureReceipt({
      provider: "google-vision",
      simulation: false,
      rawText: "   \n  ",
      confidence: null,
    });
    expect(result.draft.shop_name.value).toBeNull();
    expect(result.draft.shop_name.status).toBe("unread");
  });

  it("buildUnreadReceiptDraft konsisten: semua field unread/null", () => {
    const draft = buildUnreadReceiptDraft();
    for (const f of collectFields(draft)) {
      expect(f.status).toBe("unread");
      expect(f.value).toBeNull();
    }
  });
});

describe("structureReceipt — mode simulasi", () => {
  it("mock → draft contoh dengan label SIMULASI yang jujur", () => {
    const result = structureReceipt(RAW_SIM);
    expect(result.simulation).toBe(true);
    expect(result.provider).toBe("mock");
    expect(result.warnings.join(" ")).toContain("SIMULASI");
    expect(result.warnings).toContain(MOCK_SIMULATION_LABEL);
    // Draft mock punya isi (bukan semua unread)
    expect(result.draft.shop_name.value).toBe("Toko Berkah Jaya");
    expect(result.draft.shop_name.status).toBe("read");
  });

  it("menjaga field yang tidak terbaca tetap unread (tidak mengarang)", () => {
    const result = structureReceipt(RAW_SIM);
    // Mock sengaja menyertakan field unread/needs_review — pastikan invarian
    for (const f of collectFields(result.draft)) {
      if (f.status === "unread") expect(f.value).toBeNull();
    }
  });
});

describe("structureReceipt — provider nyata tanpa penyusun struktur", () => {
  it("teks terbaca tetapi belum ada penyusun → unread + warning jujur, bukan karangan", () => {
    const result = structureReceipt({
      provider: "google-vision",
      simulation: false,
      rawText: "NOTA TOKO\nTOTAL 165000",
      confidence: 0.9,
    });
    expect(result.simulation).toBe(false);
    // Tidak mengarang: field tetap unread karena penyusun otomatis belum aktif
    for (const f of collectFields(result.draft)) {
      expect(f.status).toBe("unread");
      expect(f.value).toBeNull();
    }
    // Teks mentah tetap disertakan untuk transparansi
    expect(result.rawText).toContain("TOTAL 165000");
    expect(result.warnings.join(" ")).toContain("belum aktif");
  });
});
