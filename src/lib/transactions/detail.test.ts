import { describe, expect, it } from "vitest";
import {
  classifyTransactionRow,
  detailDateParts,
  isValidUUID,
  openTransactionById,
  openTransactionItems,
  toSafeNumber,
  toTransactionDetail,
  toTransactionItemDetail,
  type SingleQueryResult,
  type TransactionDetailRow,
  type TransactionItemRow,
} from "./detail";

/* ------------------------------------------------------------------ */
/* Fake builder — merekam operasi chain                                 */
/* ------------------------------------------------------------------ */

interface RecordedOp {
  method: string;
  args: unknown[];
}

class RecordingChain {
  ops: RecordedOp[] = [];

  private record(method: string, args: unknown[]): this {
    this.ops.push({ method, args });
    return this;
  }

  eq(column: string, value: unknown): this {
    return this.record("eq", [column, value]);
  }
  order(column: string, options?: { ascending?: boolean }): this {
    return this.record("order", [column, options]);
  }
  maybeSingle(): Promise<SingleQueryResult> {
    this.record("maybeSingle", []);
    return Promise.resolve({ data: null, error: null });
  }
}

const TX_UUID = "1b2c3d4e-5f60-4a41-8b92-334455667788";

const ROW_POS: TransactionDetailRow = {
  id: TX_UUID,
  business_id: "biz-1",
  type: "income",
  title: "Penjualan Kasir: Kopi Susu, Roti",
  quantity: "3",
  unit_price: "0", // multi-item POS → unit_price ringkasan 0
  total: "37500.50",
  transacted_at: "2026-10-30T04:00:00.000Z",
  payment_method: "cash",
  source: "pos",
  status: "completed",
  notes: "Pelanggan langganan",
  request_id: "7c9e6679-742f-48de-b526-0a3d0f3aa100",
};

describe("isValidUUID — guard id dari URL", () => {
  it("menerima UUID standar & non-kapital", () => {
    expect(isValidUUID(TX_UUID)).toBe(true);
    expect(isValidUUID("ABCDEF01-2345-4678-9ABC-DEF012345678")).toBe(true);
  });

  it("menolak nilai asing tanpa menyentuh DB", () => {
    for (const bad of ["", "../etc", "123", "a".repeat(40), "kopi%20susu"]) {
      expect(isValidUUID(bad)).toBe(false);
    }
  });
});

describe("toSafeNumber — desimal aman via Number(), BUKAN parseInt", () => {
  it("mengonversi string desimal & number utuh", () => {
    expect(toSafeNumber("1234.56")).toBe(1234.56);
    expect(toSafeNumber(2450.5)).toBe(2450.5);
    expect(toSafeNumber("0")).toBe(0);
  });

  it("nilai tak valid → 0, bukan NaN", () => {
    expect(toSafeNumber(null)).toBe(0);
    expect(toSafeNumber("abc")).toBe(0);
    expect(toSafeNumber(undefined)).toBe(0);
  });
});

describe("classifyTransactionRow — ketiga outcome", () => {
  it("error query → 'error' (ditangani aman, tanpa data)", () => {
    expect(classifyTransactionRow({ data: null, error: { code: "42501" } })).toBe(
      "error"
    );
  });

  it("data null → 'missing' (tidak ditemukan ATAU bukan milik bisnis)", () => {
    expect(classifyTransactionRow({ data: null, error: null })).toBe("missing");
  });

  it("data ada → 'found'", () => {
    expect(classifyTransactionRow({ data: { id: TX_UUID }, error: null })).toBe(
      "found"
    );
  });
});

describe("toTransactionDetail — mapping baris transactions", () => {
  it("memetakan seluruh kolom penting (transaksi POS)", () => {
    const d = toTransactionDetail(ROW_POS);
    expect(d.id).toBe(TX_UUID);
    expect(d.title).toContain("Penjualan Kasir");
    expect(d.type).toBe("income");
    expect(d.source).toBe("pos");
    expect(d.status).toBe("completed");
    expect(d.paymentMethod).toBe("cash");
    expect(d.total).toBe(37500.5); // desimal utuh, bukan parseInt
    expect(d.notes).toBe("Pelanggan langganan");
    expect(d.requestId).toBe("7c9e6679-742f-48de-b526-0a3d0f3aa100");
    expect(d.quantity).toBe(3);
    expect(d.unitPrice).toBe(0);
  });

  it("transaksi non-POS: tanpa request_id (AI chat & manual)", () => {
    for (const source of ["ai_chat", "manual"]) {
      const d = toTransactionDetail({
        ...ROW_POS,
        source,
        request_id: null,
        notes: "",
      });
      expect(d.requestId).toBeNull();
      expect(d.notes).toBeNull(); // catatan kosong → null
    }
  });

  it("nilai hilang/tak dikenal → fallback aman", () => {
    const d = toTransactionDetail({});
    expect(d.id).toBe("");
    expect(d.title).toBe("(tanpa keterangan)");
    expect(d.type).toBe("income");
    expect(d.source).toBeNull();
    expect(d.status).toBeNull();
    expect(d.total).toBe(0);
    expect(d.dateLabel).toBe("-");
    expect(d.timeLabel).toBe("-");
  });
});

describe("detailDateParts — tanggal & jam kalender Asia/Jakarta", () => {
  it("masih hari yang sama saat 11:00 WIB", () => {
    const p = detailDateParts("2026-10-30T04:00:00.000Z");
    expect(p.dateLabel).toBe("30 Okt 2026");
    expect(p.timeLabel).toMatch(/[0-1]?1[.:]00/); // 11.00
  });

  it("18:30 UTC (= 01:30 WIB) → hari berikutnya di Jakarta", () => {
    const p = detailDateParts("2026-10-30T18:30:00.000Z"); // 01:30 WIB, 31 Okt
    expect(p.dateLabel).toBe("31 Okt 2026");
    expect(p.timeLabel).toMatch(/0?1[.:]30/);
  });
});

describe("toTransactionItemDetail — baris transaction_items", () => {
  const ITEM_ROW: TransactionItemRow = {
    id: "item-1",
    product_id: "11111111-2222-4333-8444-555555555555",
    product_name: "Kopi Susu",
    quantity: "2.5",
    unit_price: "12500.75",
    total: 31251.88,
  };

  it("menampilkan snapshot product_name & nominal desimal utuh", () => {
    const item = toTransactionItemDetail(ITEM_ROW);
    expect(item.productName).toBe("Kopi Susu");
    expect(item.productId).toBe("11111111-2222-4333-8444-555555555555");
    expect(item.quantity).toBe(2.5);
    expect(item.unitPrice).toBe(12500.75);
    expect(item.subtotal).toBe(31251.88); // dibaca dari DB, bukan dihitung ulang
  });

  it("product_id NULL tetap menampilkan product_name (produk dihapus)", () => {
    const item = toTransactionItemDetail({
      ...ITEM_ROW,
      product_id: null,
    });
    expect(item.productId).toBeNull();
    expect(item.productName).toBe("Kopi Susu");
  });

  it("product_name hilang → fallback aman, baris tetap tampil", () => {
    const item = toTransactionItemDetail({ id: "item-2", product_name: "" });
    expect(item.productName).toBe("(nama tidak tercatat)");
    expect(item.subtotal).toBe(0);
  });

  it("transaksi POS dengan beberapa item — semuanya terpetakan", () => {
    const items = [
      ITEM_ROW,
      { ...ITEM_ROW, id: "item-b", product_id: null, product_name: "Roti Bakar", quantity: 1, unit_price: "6249.87", total: "6249.87" },
    ].map((row) => toTransactionItemDetail(row));
    expect(items).toHaveLength(2);
    expect(items[0].productName).toBe("Kopi Susu");
    expect(items[1].productId).toBeNull();
    expect(items[1].productName).toBe("Roti Bakar");
  });
});

/* ------------------------------------------------------------------ */
/* Query contract                                                       */
/* ------------------------------------------------------------------ */

describe("openTransactionById — isolasi business_id di query transaksi", () => {
  it("eq business_id (server) PERTAMA, lalu id, lalu maybeSingle", async () => {
    const chain = new RecordingChain();
    const result = openTransactionById(chain, "biz-server-9", TX_UUID);
    expect(chain.ops[0]).toEqual({
      method: "eq",
      args: ["business_id", "biz-server-9"],
    });
    expect(chain.ops[1]).toEqual({
      method: "eq",
      args: ["id", TX_UUID],
    });
    expect(chain.ops.map((o) => o.method)).toContain("maybeSingle");

    const resolved = await (result as Promise<SingleQueryResult>);
    expect(resolved).toEqual({ data: null, error: null });
  });
});

describe("openTransactionItems — isolasi business_id di query item", () => {
  it("eq business_id PERTAMA, lalu transaction_id, lalu order — TANPA join", () => {
    const chain = new RecordingChain();
    const result = openTransactionItems(chain, "biz-server-9", TX_UUID);
    expect(result).toBe(chain);
    expect(chain.ops.map((o) => o.method)).toEqual(["eq", "eq", "order"]);
    expect(chain.ops[0]).toEqual({
      method: "eq",
      args: ["business_id", "biz-server-9"],
    });
    expect(chain.ops[1]).toEqual({
      method: "eq",
      args: ["transaction_id", TX_UUID],
    });
    expect(chain.ops[2]).toEqual({
      method: "order",
      args: ["created_at", { ascending: true }],
    });
  });
});
