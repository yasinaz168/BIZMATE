import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  isSameAiPayload,
  newAiRequestId,
  normalizeAiRequestId,
  rowToAiPayload,
  validatedToAiPayload,
  type AiPayloadComparable,
} from "./save-idempotency";

/**
 * Pengujian helper idempotency transaksi AI (R2.4):
 * - request_id wajib UUID (dibuat client, server tidak membuat).
 * - Pembandingan payload memakai nilai ternormalisasi (validator AI /
 *   baris DB) — desimal-safe, notes kosong ≡ null, title trim.
 * - Kontrak source chat.tsx ↔ route.ts (dibaca dari source file).
 */

const REQUEST_ID = "c3d4e5f6-a7b8-4c9d-8e0f-1a2b3c4d5e6f";

/** ValidatedTransaction (hasil validator AI) contoh */
const VALIDATED = {
  type: "income",
  title: "Jual kopi",
  quantity: 2,
  unit_price: 50000,
  total: 100000,
  transacted_at_iso: "2024-03-15T05:00:00.000Z",
  payment_method: "cash",
  notes: "",
} as const;

/** Baris DB contoh (read-back) — angka string ala PostgREST */
const ROW: Record<string, unknown> = {
  id: "tx-old-1",
  source: "ai_chat",
  type: "income",
  title: "Jual kopi",
  quantity: "2",
  unit_price: "50000",
  total: "100000",
  transacted_at: "2024-03-15T05:00:00.000Z",
  payment_method: "cash",
  notes: null,
};

describe("normalizeAiRequestId — request_id UUID wajib", () => {
  it("UUID valid diterima (terpangkas)", () => {
    expect(normalizeAiRequestId(`  ${REQUEST_ID} `)).toEqual({
      ok: true,
      value: REQUEST_ID,
    });
  });

  it("kosong/hilang/non-string → 'request_id wajib diisi.'", () => {
    for (const bad of ["", "   ", null, undefined, 123]) {
      const res = normalizeAiRequestId(bad);
      expect(res.ok).toBe(false);
      expect(res.error).toBe("request_id wajib diisi.");
    }
  });

  it("bentuk bukan UUID → ditolak dengan pesan yang konsisten", () => {
    for (const bad of ["bukan-uuid", "12345", "aaaaaaaa-bbbb-cccc-dddd"]) {
      const res = normalizeAiRequestId(bad);
      expect(res.ok).toBe(false);
      expect(res.error).toBe("request_id harus berupa UUID yang valid.");
    }
  });
});

describe("newAiRequestId — dibuat client", () => {
  it("UUID valid & unik per draf", () => {
    const a = newAiRequestId();
    const b = newAiRequestId();
    expect(a).not.toBe(b);
    expect(/^[0-9a-f-]{36}$/i.test(a)).toBe(true);
  });
});

describe("isSameAiPayload — pembanding payload AI", () => {
  it("validator AI vs baris DB yang setara → true (angka desimal-safe)", () => {
    const a = validatedToAiPayload(VALIDATED);
    const b = rowToAiPayload(ROW);
    expect(isSameAiPayload(a, b)).toBe(true);
  });

  it("notes kosong (validator) ≡ null (baris DB)", () => {
    const a = validatedToAiPayload({ ...VALIDATED, notes: "" });
    const b = rowToAiPayload({ ...ROW, notes: null });
    expect(isSameAiPayload(a, b)).toBe(true);
  });

  it("notes berisi → sama setelah trim, beda konten → false", () => {
    const a = validatedToAiPayload({ ...VALIDATED, notes: "okt-okt" });
    const trim = rowToAiPayload({ ...ROW, notes: "  okt-okt  " });
    const lain = rowToAiPayload({ ...ROW, notes: "lain" });
    expect(isSameAiPayload(a, trim)).toBe(true);
    expect(isSameAiPayload(a, lain)).toBe(false);
  });

  it("format tanggal berbeda (offset vs Z) tetap dianggap sama (kanonik)", () => {
    const a = validatedToAiPayload(VALIDATED);
    const b = rowToAiPayload({ ...ROW, transacted_at: "2024-03-15T05:00:00+00:00" });
    expect(isSameAiPayload(a, b)).toBe(true);
  });

  it("perbedaan field → false (type/title/qty/price/total/tanggal/metode)", () => {
    const a = validatedToAiPayload(VALIDATED);
    expect(isSameAiPayload(a, { ...a, type: "expense" })).toBe(false);
    expect(isSameAiPayload(a, { ...a, title: "Jual teh" })).toBe(false);
    expect(isSameAiPayload(a, { ...a, quantity: 3 })).toBe(false);
    expect(isSameAiPayload(a, { ...a, unit_price: 50001 })).toBe(false);
    expect(isSameAiPayload(a, { ...a, total: 100001 })).toBe(false);
    expect(
      isSameAiPayload(a, { ...a, transacted_at: "2024-03-16T05:00:00.000Z" })
    ).toBe(false);
    expect(isSameAiPayload(a, { ...a, payment_method: "qris" })).toBe(false);
    expect(isSameAiPayload(a, { ...a, payment_method: null })).toBe(false);
  });

  it("argumen null/undefined → false", () => {
    const a = validatedToAiPayload(VALIDATED);
    expect(isSameAiPayload(null, a)).toBe(false);
    expect(isSameAiPayload(a, undefined)).toBe(false);
    expect(isSameAiPayload(null, null)).toBe(false);
  });
});

describe("kontrak source chat.tsx ↔ route.ts (dibaca dari source)", () => {
  const chatSource = readFileSync(
    fileURLToPath(new URL("../../components/assistant/chat.tsx", import.meta.url)),
    "utf8"
  );
  const routeSource = readFileSync(
    fileURLToPath(
      new URL("../../app/api/assistant/save/route.ts", import.meta.url)
    ),
    "utf8"
  );

  it("chat mengirim request_id draf ke body POST", () => {
    expect(chatSource).toContain("request_id: preview.requestId");
    expect(chatSource).toContain("requestId: newAiRequestId()");
  });

  it("request_id STABIL selama draf diedit (updatePreview menyebarkan ...p)", () => {
    // patch hanya pada field transaction — requestId ikut terbawa dari ...p
    expect(chatSource).toContain("...p, transaction: { ...p.transaction");
  });

  it("server membaca request_id dan TIDAK PERNAH membuat UUID sendiri", () => {
    expect(routeSource).toContain("normalizeAiRequestId(body?.request_id)");
    expect(routeSource).not.toContain("randomUUID");
    expect(routeSource).not.toContain("newAiRequestId");
  });
});
