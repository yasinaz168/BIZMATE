import { describe, expect, it } from "vitest";
import { fetchMonthRows, getDashboardData } from "./dashboard-data";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Pengujian dashboard-data (R1 — hanya 'completed' yang dihitung):
 * - Query agregasi WAJIB membawa .eq("status","completed") + business_id
 *   dari server (urutan terverifikasi dengan chain perekam).
 * - Baris draft/void tidak boleh masuk omzet, pengeluaran, profit,
 *   jumlah transaksi, top produk, maupun recent (guard lapis kedua).
 */

interface RecordedOp {
  method: string;
  args: unknown[];
}

class RecordingChain {
  ops: RecordedOp[] = [];
  /** hasil yang akan dikembalikan saat chain di-await (diatur test) */
  result: { data: unknown; error: unknown } = { data: null, error: null };

  select(columns: unknown): this {
    this.ops.push({ method: "select", args: [columns] });
    return this;
  }
  eq(column: string, value: unknown): this {
    this.ops.push({ method: "eq", args: [column, value] });
    return this;
  }
  gte(column: string, value: unknown): this {
    this.ops.push({ method: "gte", args: [column, value] });
    return this;
  }
  order(column: string, options: unknown): this {
    this.ops.push({ method: "order", args: [column, options] });
    return this;
  }
  then<T1, T2 = never>(
    onFulfilled?: ((value: { data: unknown; error: unknown }) => T1 | PromiseLike<T1>) | null,
    onRejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null
  ): Promise<T1 | T2> {
    return Promise.resolve(this.result).then(onFulfilled, onRejected);
  }
}

/** Fake supabase dengan perekam ops + antrean hasil FIFO */
function makeFakeSupabase(queued: Array<{ data: unknown; error: unknown }>) {
  const tables: Array<{ table: string; chain: RecordingChain }> = [];
  let idx = 0;
  const client = {
    from(table: string): RecordingChain {
      const chain = new RecordingChain();
      chain.result = queued[idx++] ?? { data: null, error: null };
      tables.push({ table, chain });
      return chain;
    },
  };
  return { client: client as unknown as SupabaseClient, tables };
}

/** Baris mentah ala tabel transactions */
function txRow(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: "tx-1",
    type: "income",
    title: "Kopi",
    quantity: 2,
    total: 10000,
    transacted_at: "2026-10-30T04:00:00.000Z", // 11:00 WIB
    payment_method: "cash",
    status: "completed",
    ...overrides,
  };
}

describe("getDashboardData — kontrak query (R1)", () => {
  it("filter business_id + status='completed' (urutan) + gte awal bulan WIB", async () => {
    const spy = makeFakeSupabase([{ data: [], error: null }]);
    await getDashboardData(spy.client, "biz-server-1");

    expect(spy.tables).toHaveLength(1);
    const { table, chain } = spy.tables[0];
    expect(table).toBe("transactions");
    const eqArgs = chain.ops.filter((o) => o.method === "eq");
    expect(eqArgs).toHaveLength(2);
    expect(eqArgs[0]).toEqual({ method: "eq", args: ["business_id", "biz-server-1"] });
    expect(eqArgs[1]).toEqual({ method: "eq", args: ["status", "completed"] });
    // kolom status ikut di-select untuk kepentingan audit
    const cols = String(chain.ops[0].args[0]);
    expect(cols).toContain("status");
  });
});

describe("getDashboardData — agregasi mengabaikan draft & void (R1)", () => {
  it("omzet/pengeluaran/profit/jumlah hanya dari baris completed", async () => {
    const spy = makeFakeSupabase([
      {
        data: [
          txRow({ id: "tx-a", total: 10000, quantity: 2, title: "Kopi", status: "completed" }),
          txRow({ id: "tx-b", total: 5000, title: "Kopi (draf)", status: "draft" }),
          txRow({
            id: "tx-c",
            type: "expense",
            total: 999,
            title: "Bahan (void)",
            status: "void",
          }),
          txRow({ id: "tx-d", type: "expense", total: 2500, title: "Bahan", status: "completed" }),
        ],
        error: null,
      },
    ]);

    const res = await getDashboardData(spy.client, "biz-1");
    expect(res.monthSales).toBe(10000); // draft 5000 TIDAK masuk
    expect(res.monthExpenses).toBe(2500); // void 999 TIDAK masuk
    expect(res.monthProfit).toBe(7500);
    expect(res.monthTransactions).toBe(2); // hanya 2 baris completed
    expect(res.hasNoTransactionAtAll).toBe(false);

    // top products — "Kopi" sekali (qty 2); draf tidak muncul
    expect(res.topProducts).toEqual([
      { rank: 1, name: "Kopi", sold: 2, revenue: 10000 },
    ]);

    // recent hanya baris completed
    expect(res.recentTransactions.map((t) => t.id)).toEqual(["tx-a", "tx-d"]);
  });

  it("semua baris non-completed → dianggap belum ada transaksi sama sekali", async () => {
    const spy = makeFakeSupabase([
      {
        data: [
          txRow({ id: "tx-b", status: "draft" }),
          txRow({ id: "tx-c", status: "void" }),
        ],
        error: null,
      },
    ]);
    const res = await getDashboardData(spy.client, "biz-1");
    expect(res.hasNoTransactionAtAll).toBe(true);
    expect(res.monthSales).toBe(0);
    expect(res.monthTransactions).toBe(0);
    expect(res.topProducts).toEqual([]);
  });

  it("baris tanpa status (data lama) tetap dihitung — aturan bersifat mengecualikan draft/void", async () => {
    const row = txRow({ id: "tx-lama", total: 7000 });
    delete (row as Record<string, unknown>).status;
    const spy = makeFakeSupabase([{ data: [row], error: null }]);
    const res = await getDashboardData(spy.client, "biz-1");
    expect(res.monthSales).toBe(7000);
    expect(res.monthTransactions).toBe(1);
  });
});

describe("fetchMonthRows — insight (R1)", () => {
  it("filter business_id + status='completed' sebelum gte bulan", async () => {
    const spy = makeFakeSupabase([{ data: [], error: null }]);
    const rows = await fetchMonthRows(spy.client, "biz-in-1");
    expect(rows).toEqual([]);

    const { table, chain } = spy.tables[0];
    expect(table).toBe("transactions");
    const eqArgs = chain.ops.filter((o) => o.method === "eq");
    expect(eqArgs[0]).toEqual({ method: "eq", args: ["business_id", "biz-in-1"] });
    expect(eqArgs[1]).toEqual({ method: "eq", args: ["status", "completed"] });
    // gte bulan berjalan masih ada (WIB)
    expect(chain.ops.some((o) => o.method === "gte")).toBe(true);
  });

  it("baris hasil dioper ke buildAutoInsight tanpa kehilangan kolom", async () => {
    const spy = makeFakeSupabase([
      { data: [txRow({ total: 25000 })], error: null },
    ]);
    const rows = await fetchMonthRows(spy.client, "biz-1");
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe("income");
    expect(rows[0].total).toBe(25000); // override txRow dipertahankan
    expect(rows[0].transacted_at).toBe("2026-10-30T04:00:00.000Z");
  });
});
