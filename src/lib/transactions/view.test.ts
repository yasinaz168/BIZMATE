import { describe, expect, it } from "vitest";
import {
  sourceBadge,
  statusBadge,
  summarizeTransactionTotals,
  toTransactionListItem,
  transactionDateLabel,
  type TransactionRawRow,
} from "./view";

/** Baris mentah minimal ala tabel transactions */
function row(overrides: Partial<TransactionRawRow>): TransactionRawRow {
  return {
    id: "tx-1",
    title: "Kopi Susu",
    type: "income",
    source: "pos",
    status: "completed",
    payment_method: "cash",
    transacted_at: "2026-10-30T04:00:00.000Z",
    total: "10000",
    ...overrides,
  };
}

describe("toTransactionListItem — nominal desimal aman (Number, BUKAN parseInt)", () => {
  it("total string desimal tetap utuh", () => {
    const item = toTransactionListItem(row({ total: "1234.56" }));
    expect(item.total).toBe(1234.56);
  });

  it("total string bulat dikonversi ke number", () => {
    expect(toTransactionListItem(row({ total: "2500" })).total).toBe(2500);
  });

  it("total number dengan pecahan dipertahankan, tidak dibulatkan di lib", () => {
    expect(toTransactionListItem(row({ total: 2450.5 })).total).toBe(2450.5);
  });

  it("nilai tidak valid/tak ada → 0, bukan NaN", () => {
    expect(toTransactionListItem(row({ total: null })).total).toBe(0);
    expect(toTransactionListItem(row({ total: "abc" })).total).toBe(0);
  });
});

describe("toTransactionListItem — pemetaan kolom", () => {
  it("menyalin title, sumber, status, dan label metode", () => {
    const item = toTransactionListItem(
      row({
        title: "Sewa Ruko Oktober",
        type: "expense",
        source: "manual",
        status: "draft",
        payment_method: "transfer",
      })
    );
    expect(item.title).toBe("Sewa Ruko Oktober");
    expect(item.type).toBe("expense");
    expect(item.source).toBe("manual");
    expect(item.status).toBe("draft");
    expect(item.paymentLabel).toBe("transfer");
  });

  it("tipe tak dikenal aman dianggap income; sumber/status asing → null", () => {
    const item = toTransactionListItem(
      row({ type: "misteri", source: "luar", status: "aneh" })
    );
    expect(item.type).toBe("income");
    expect(item.source).toBeNull();
    expect(item.status).toBeNull();
  });

  it("judul kosong memakai fallback tanpa membocorkan error", () => {
    const item = toTransactionListItem(row({ title: "" }));
    expect(item.title).toBe("(tanpa keterangan)");
  });
});

describe("transactionDateLabel — batas hari kalender Asia/Jakarta", () => {
  it("11:00 WIB masih hari yang sama", () => {
    // 2026-10-30T04:00:00Z = 11:00 WIB
    expect(transactionDateLabel("2026-10-30T04:00:00.000Z")).toBe("30 Okt 2026");
  });

  it("01:30 WIB (2026-10-30T17:30:00Z) sudah hari berikutnya di Jakarta", () => {
    expect(transactionDateLabel("2026-10-30T17:30:00.000Z")).toBe("31 Okt 2026");
  });

  it("nilai tidak valid → strip aman", () => {
    expect(transactionDateLabel("bukan-iso")).toBe("-");
  });
});

describe("summarizeTransactionTotals — ringkasan dari semua baris filter", () => {
  it("memisahkan pemasukan & pengeluaran, termasuk desimal", () => {
    const summary = summarizeTransactionTotals([
      { type: "income", total: "10000" },
      { type: "income", total: 2500.5 },
      { type: "expense", total: "75.25" },
      { type: "expense", total: 1500 },
    ]);
    expect(summary.income).toBe(12500.5);
    expect(summary.expense).toBe(1575.25);
  });

  it("jenis/nilai tak dikenal diabaikan, bukan melempar error", () => {
    const summary = summarizeTransactionTotals([
      { type: "apa", total: "99999" },
      { type: "income" },
      {},
    ]);
    expect(summary).toEqual({ income: 0, expense: 0 });
  });

  it("R1: transaksi draft & void TIDAK masuk agregasi", () => {
    const summary = summarizeTransactionTotals([
      { type: "income", total: "10000", status: "completed" },
      { type: "income", total: "77777", status: "draft" },
      { type: "expense", total: "88888", status: "void" },
    ]);
    expect(summary).toEqual({ income: 10000, expense: 0 });
  });

  it("R1: campuran draft/void/completed + desimal tetap benar", () => {
    const summary = summarizeTransactionTotals([
      { type: "income", total: 12500.5, status: "completed" },
      { type: "income", total: 9000, status: "void" },
      { type: "expense", total: "75.25", status: "void" },
      { type: "expense", total: 1500, status: "completed" },
      { type: "income", total: 2000, status: "draft" },
    ]);
    expect(summary.income).toBe(12500.5);
    expect(summary.expense).toBe(1500);
  });

  it("daftar kosong → nol", () => {
    expect(summarizeTransactionTotals([])).toEqual({ income: 0, expense: 0 });
  });
});

describe("label & varian badge", () => {
  it("sumber memakai label Indonesia & varian konsisten", () => {
    expect(sourceBadge("pos")).toEqual({ label: "POS", variant: "deep" });
    expect(sourceBadge("ai_chat")).toEqual({ label: "AI Chat", variant: "default" });
    expect(sourceBadge("receipt_scan")).toEqual({ label: "Nota", variant: "muted" });
    expect(sourceBadge("manual")).toEqual({ label: "Manual", variant: "outline" });
    expect(sourceBadge(null)).toBeNull();
  });

  it("status memakai label Indonesia sesuai 3 nilai schema", () => {
    expect(statusBadge("completed")).toEqual({ label: "Selesai", variant: "outline" });
    expect(statusBadge("draft")).toEqual({ label: "Draf", variant: "muted" });
    expect(statusBadge("void")).toEqual({ label: "Dibatalkan", variant: "expense" });
    expect(statusBadge(null)).toBeNull();
  });
});
