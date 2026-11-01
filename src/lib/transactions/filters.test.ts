import { describe, expect, it } from "vitest";
import {
  buildSearchOrFilter,
  buildTransactionsHref,
  clampPage,
  hasActiveTransactionFilter,
  isoDayEndUTC,
  MAX_SEARCH_LENGTH,
  openTransactionList,
  openTransactionTotals,
  PAGE_SIZE,
  pageToRange,
  parseTransactionsParams,
  transactionDateGates,
  transactionFilterOps,
  type TransactionFilters,
} from "./filters";

/* ------------------------------------------------------------------ */
/* Fake builder — merekam seluruh operasi chain untuk verifikasi query   */
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
  gte(column: string, value: unknown): this {
    return this.record("gte", [column, value]);
  }
  lte(column: string, value: unknown): this {
    return this.record("lte", [column, value]);
  }
  or(filter: string): this {
    return this.record("or", [filter]);
  }
  range(from: number, to: number): this {
    return this.record("range", [from, to]);
  }
  order(column: string, options?: { ascending?: boolean }): this {
    return this.record("order", [column, options]);
  }
}

const BASE_FILTERS: TransactionFilters = {
  q: "",
  fromDay: null,
  toDay: null,
  type: null,
  source: null,
  paymentMethod: null,
  status: null,
  page: 1,
};

describe("parseTransactionsParams — validasi & normalisasi parameter URL", () => {
  it("menerima nilai valid dan mengabaikan yang tidak valid", () => {
    const f = parseTransactionsParams({
      type: "income",
      source: "pos",
      payment_method: "qris",
      status: "completed",
    });
    expect(f.type).toBe("income");
    expect(f.source).toBe("pos");
    expect(f.paymentMethod).toBe("qris");
    expect(f.status).toBe("completed");

    const invalid = parseTransactionsParams({
      type: "bulan",
      source: "dump",
      payment_method: "kartu",
      status: "lolos",
    });
    expect(invalid.type).toBeNull();
    expect(invalid.source).toBeNull();
    expect(invalid.paymentMethod).toBeNull();
    expect(invalid.status).toBeNull();
  });

  it("memakai nilai pertama bila parameter dikirim sebagai array", () => {
    const f = parseTransactionsParams({ type: ["expense", "income"] });
    expect(f.type).toBe("expense");
  });

  it("q dipangkas, koma/kurung dihapus, spasi dirapikan, panjang dibatasi", () => {
    const f = parseTransactionsParams({ q: "  kopi, susu (gelap) 50%  " });
    expect(f.q).toBe("kopi susu gelap 50%");
    expect(f.q).not.toContain(",");
    expect(f.q).not.toContain("(");

    const long = parseTransactionsParams({ q: "x".repeat(500) });
    expect(long.q.length).toBe(MAX_SEARCH_LENGTH);
  });

  it("tanggal kalender tidak valid diabaikan (2026-13-45, 2026-02-30, bukan-tanggal)", () => {
    for (const bad of ["2026-13-45", "2026-02-30", "bukan-tanggal", "2026-1-5"]) {
      const f = parseTransactionsParams({ from: bad, to: bad });
      expect(f.fromDay).toBeNull();
      expect(f.toDay).toBeNull();
    }
  });

  it("tanggal valid diterima", () => {
    const f = parseTransactionsParams({ from: "2026-01-05", to: "2026-01-07" });
    expect(f.fromDay).toBe("2026-01-05");
    expect(f.toDay).toBe("2026-01-07");
  });

  it("rentang terbalik (from > to) diabaikan keduanya", () => {
    const f = parseTransactionsParams({ from: "2026-01-07", to: "2026-01-05" });
    expect(f.fromDay).toBeNull();
    expect(f.toDay).toBeNull();
  });

  it("page: bukan bilangan bulat positif → 1; dibatasi maksimum", () => {
    expect(parseTransactionsParams({}).page).toBe(1);
    expect(parseTransactionsParams({ page: "0" }).page).toBe(1);
    expect(parseTransactionsParams({ page: "-2" }).page).toBe(1);
    expect(parseTransactionsParams({ page: "abc" }).page).toBe(1);
    expect(parseTransactionsParams({ page: "3" }).page).toBe(3);
    expect(parseTransactionsParams({ page: "999999999" }).page).toBeLessThan(999999999);
  });

  it("hasActiveTransactionFilter mengenali filter aktif", () => {
    expect(hasActiveTransactionFilter(BASE_FILTERS)).toBe(false);
    expect(hasActiveTransactionFilter({ ...BASE_FILTERS, q: "kopi" })).toBe(true);
    expect(hasActiveTransactionFilter({ ...BASE_FILTERS, type: "income" })).toBe(true);
    expect(hasActiveTransactionFilter({ ...BASE_FILTERS, fromDay: "2026-01-01" })).toBe(true);
  });
});

describe("batas tanggal & pagination", () => {
  it("isoDayEndUTC = 23:59:59.999 WIB ( inclusive akhir hari )", () => {
    expect(isoDayEndUTC("2026-01-05")).toBe("2026-01-05T16:59:59.999Z");
  });

  it("transactionDateGates memakai awal hari WIB untuk from", () => {
    const gates = transactionDateGates({ ...BASE_FILTERS, fromDay: "2026-01-05" });
    expect(gates.from).toBe("2026-01-04T17:00:00.000Z");
    expect(gates.to).toBeNull();
  });

  it("pageToRange menghasilkan offset .range yang benar (PAGE_SIZE per halaman)", () => {
    expect(PAGE_SIZE).toBeGreaterThan(0);
    expect(pageToRange(1)).toEqual({ from: 0, to: PAGE_SIZE - 1 });
    expect(pageToRange(2)).toEqual({
      from: PAGE_SIZE,
      to: PAGE_SIZE * 2 - 1,
    });
    expect(pageToRange(3)).toEqual({
      from: PAGE_SIZE * 2,
      to: PAGE_SIZE * 3 - 1,
    });
  });

  it("clampPage membatasi ke halaman terakhir; data kosong → 1", () => {
    expect(clampPage(5, 25)).toBe(3); // 25 item / 10 = 3 halaman
    expect(clampPage(2, 30)).toBe(2);
    expect(clampPage(9, 0)).toBe(1);
    expect(clampPage(1, 0)).toBe(1);
  });
});

describe("transactionFilterOps — rencana filter deterministik", () => {
  it("tanpa filter → op kosong", () => {
    expect(transactionFilterOps(BASE_FILTERS)).toEqual([]);
  });

  it("menerjemahkan seluruh filter dengan urutan tetap", () => {
    const ops = transactionFilterOps({
      ...BASE_FILTERS,
      type: "expense",
      source: "manual",
      paymentMethod: "transfer",
      status: "void",
      fromDay: "2026-01-05",
      toDay: "2026-01-05",
    });
    const summary = ops.map((o) => `${o.op}:${o.column}`);
    expect(summary).toEqual([
      "eq:type",
      "eq:source",
      "eq:payment_method",
      "eq:status",
      "gte:transacted_at",
      "lte:transacted_at",
    ]);
    expect(ops[2].value).toBe("transfer");
    expect(ops[4].value).toBe("2026-01-04T17:00:00.000Z"); // awal hari WIB
    expect(ops[5].value).toBe("2026-01-05T16:59:59.999Z"); // akhir hari WIB
  });

  it("pencarian difilter di server dengan or() title + notes (ILIKE)", () => {
    const ops = transactionFilterOps({ ...BASE_FILTERS, q: "kopi 50%" });
    expect(ops).toHaveLength(1);
    expect(ops[0].op).toBe("or");
    expect(ops[0].value).toBe(
      "title.ilike.%kopi 50\\%%,notes.ilike.%kopi 50\\%%"
    );
  });

  it("q kosong → tanpa op or()", () => {
    expect(buildSearchOrFilter("")).toBeNull();
    expect(transactionFilterOps({ ...BASE_FILTERS, q: "" })).toEqual([]);
  });
});

describe("openTransactionList / openTransactionTotals — isolasi business_id", () => {
  it("eq business_id SELALU operasi pertama (dari server, bukan URL)", () => {
    const chain = new RecordingChain();
    openTransactionList(chain, "biz-server-1", {
      ...BASE_FILTERS,
      type: "income",
      page: 2,
    });
    expect(chain.ops[0]).toEqual({
      method: "eq",
      args: ["business_id", "biz-server-1"],
    });
    // isolasi tetap benar walau filter kosong sekalipun
    const bare = new RecordingChain();
    openTransactionList(bare, "biz-server-2", BASE_FILTERS);
    expect(bare.ops[0].args).toEqual(["business_id", "biz-server-2"]);
  });

  it("openTransactionList menerapkan filter + urutan stabil + range halaman", () => {
    const chain = new RecordingChain();
    const result = openTransactionList(chain, "biz-1", {
      ...BASE_FILTERS,
      q: "kopi",
      type: "income",
      page: 2,
    });
    expect(result).toBe(chain);

    const methods = chain.ops.map((o) => o.method);
    expect(methods).toEqual([
      "eq", // business_id
      "eq", // type
      "or", // pencarian
      "order", // transacted_at desc
      "order", // id desc (urutan stabil untuk pagination)
      "range",
    ]);
    expect(chain.ops[0]).toEqual({ method: "eq", args: ["business_id", "biz-1"] });
    expect(chain.ops[1]).toEqual({ method: "eq", args: ["type", "income"] });
    expect(chain.ops[3]).toEqual({
      method: "order",
      args: ["transacted_at", { ascending: false }],
    });
    expect(chain.ops[4]).toEqual({
      method: "order",
      args: ["id", { ascending: false }],
    });
    // halaman 2 → offset PAGE_SIZE
    expect(chain.ops[5]).toEqual({
      method: "range",
      args: [PAGE_SIZE, PAGE_SIZE * 2 - 1],
    });
  });

  it("openTransactionTotals memakai filter yang sama + status='completed' (R1), TANPA range/order", () => {
    const chain = new RecordingChain();
    const result = openTransactionTotals(chain, "biz-1", {
      ...BASE_FILTERS,
      type: "expense",
      fromDay: "2026-01-01",
    });
    expect(result).toBe(chain);
    const methods = chain.ops.map((o) => o.method);
    expect(methods).toEqual(["eq", "eq", "gte", "eq"]);
    expect(methods).not.toContain("range");
    expect(methods).not.toContain("order");
    // isolasi business_id tetap operasi pertama
    expect(chain.ops[0]).toEqual({
      method: "eq",
      args: ["business_id", "biz-1"],
    });
    // R1: ringkasan keuangan HANYA transaksi completed — opsion filter
    // status pengguna tidak menggantikan aturan ini
    expect(chain.ops.at(-1)).toEqual({
      method: "eq",
      args: ["status", "completed"],
    });
  });

  it("openTransactionTotals tetap menambahkan status='completed' walau tanpa filter lain (R1)", () => {
    const chain = new RecordingChain();
    openTransactionTotals(chain, "biz-1", { ...BASE_FILTERS });
    expect(chain.ops.map((o) => o.method)).toEqual(["eq", "eq"]);
    expect(chain.ops[0].args[0]).toBe("business_id");
    expect(chain.ops.at(-1)).toEqual({
      method: "eq",
      args: ["status", "completed"],
    });
  });

  it("openTransactionTotals dengan filter status=draft pengguna → draft tidak bisa masuk ringkasan", () => {
    const chain = new RecordingChain();
    openTransactionTotals(chain, "biz-1", { ...BASE_FILTERS, status: "draft" });
    // op pengguna status=draft TETAP dijalankan (hasil = kosong → ringkasan 0)
    expect(chain.ops[1]).toEqual({ method: "eq", args: ["status", "draft"] });
    expect(chain.ops.at(-1)).toEqual({
      method: "eq",
      args: ["status", "completed"],
    });
  });
});

describe("buildTransactionsHref — filter bertahan saat pindah halaman", () => {
  it("memasukkan seluruh filter aktif ke URL", () => {
    const href = buildTransactionsHref(
      {
        ...BASE_FILTERS,
        q: "kopi",
        fromDay: "2026-01-01",
        toDay: "2026-01-31",
        type: "income",
        source: "pos",
        paymentMethod: "cash",
        status: "completed",
      },
      3
    );
    const search = href.replace("/transaksi?", "");
    const params = new URLSearchParams(search);
    expect(params.get("q")).toBe("kopi");
    expect(params.get("from")).toBe("2026-01-01");
    expect(params.get("to")).toBe("2026-01-31");
    expect(params.get("type")).toBe("income");
    expect(params.get("source")).toBe("pos");
    expect(params.get("payment_method")).toBe("cash");
    expect(params.get("status")).toBe("completed");
    expect(params.get("page")).toBe("3");
    expect(href.startsWith("/transaksi?")).toBe(true);
  });

  it("tanpa filter & halaman 1 → path bersih; parameter kosong tidak ikut", () => {
    expect(buildTransactionsHref(BASE_FILTERS, 1)).toBe("/transaksi");
    expect(buildTransactionsHref({ ...BASE_FILTERS, q: "kopi" }, 1)).toBe(
      "/transaksi?q=kopi"
    );
  });

  it("nilai q tersanitasi dipertahankan utuh untuk dikirim ulang", () => {
    const parsed = parseTransactionsParams({ q: "sus & bubuk" });
    const href = buildTransactionsHref(parsed, 2);
    const roundTrip = parseTransactionsParams(
      Object.fromEntries(new URLSearchParams(href.replace("/transaksi?", "")))
    );
    expect(roundTrip.q).toBe("sus & bubuk");
    expect(roundTrip.page).toBe(2);
  });
});
