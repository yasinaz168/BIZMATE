import { describe, expect, it } from "vitest";
import {
  needsReviewField,
  readField,
  unreadField,
  type OcrField,
  type ReceiptDraft,
} from "./types";
import { buildMockReceiptDraft } from "./mock";

/**
 * Pengujian KONTRAK data OCR (Tahap 1).
 *
 * Dijaga:
 * - Setiap field memakai pola OcrField { value, status }.
 * - Invarian privasi/kejujuran: status "unread" WAJIB bernilai null
 *   (tidak boleh ada nilai karangan), "needs_review" mempertahankan
 *   nilai apa adanya untuk diperiksa pengguna.
 */

const VALID_STATUSES = ["read", "needs_review", "unread"];

function collectFields(draft: ReceiptDraft): Array<OcrField<unknown>> {
  const fields: Array<OcrField<unknown>> = [
    draft.shop_name,
    draft.transacted_at,
    draft.total,
  ];
  for (const item of draft.items) {
    fields.push(item.name, item.quantity, item.unit_price, item.total);
  }
  return fields;
}

describe("kontrak data OCR — bentuk ReceiptDraft/ReceiptItem/OcrField", () => {
  it("ReceiptDraft memuat shop_name, transacted_at, items, total", () => {
    const draft = buildMockReceiptDraft();
    expect(draft).toHaveProperty("shop_name");
    expect(draft).toHaveProperty("transacted_at");
    expect(draft).toHaveProperty("items");
    expect(draft).toHaveProperty("total");
    expect(Array.isArray(draft.items)).toBe(true);
    expect(draft.items.length).toBeGreaterThan(0);
  });

  it("setiap ReceiptItem memuat name, quantity, unit_price, total sebagai OcrField", () => {
    const draft = buildMockReceiptDraft();
    for (const item of draft.items) {
      const fields: Array<[string, OcrField<unknown>]> = [
        ["name", item.name],
        ["quantity", item.quantity],
        ["unit_price", item.unit_price],
        ["total", item.total],
      ];
      for (const [label, field] of fields) {
        expect(field, `item.${label}`).toHaveProperty("value");
        expect(field, `item.${label}`).toHaveProperty("status");
        expect(VALID_STATUSES, `item.${label}`).toContain(field.status);
      }
    }
  });

  it("setiap field memakai status yang valid di seluruh draft", () => {
    for (const field of collectFields(buildMockReceiptDraft())) {
      expect(VALID_STATUSES).toContain(field.status);
    }
  });

  it("konstruktor field konsisten dengan invarian kontrak", () => {
    expect(readField("x")).toEqual({ value: "x", status: "read" });
    expect(needsReviewField(7)).toEqual({ value: 7, status: "needs_review" });
    expect(unreadField<string>()).toEqual({ value: null, status: "unread" });
  });
});

describe("kontrak data OCR — invarian 'unread' = null", () => {
  it("field berstatus 'unread' WAJIB bernilai null (tidak boleh ditebak)", () => {
    const draft = buildMockReceiptDraft();
    for (const field of collectFields(draft)) {
      if (field.status === "unread") {
        expect(field.value).toBeNull();
      }
    }
  });

  it("field berstatus 'read'/'needs_review' mempertahankan nilainya", () => {
    const draft = buildMockReceiptDraft();
    for (const field of collectFields(draft)) {
      if (field.status !== "unread") {
        expect(field.value).not.toBeNull();
      }
    }
  });

  it("draft mock mendemonstrasikan ketiga status: read, needs_review, unread", () => {
    const statuses = new Set(collectFields(buildMockReceiptDraft()).map((f) => f.status));
    expect(statuses).toContain("read");
    expect(statuses).toContain("needs_review");
    expect(statuses).toContain("unread");
  });
});
