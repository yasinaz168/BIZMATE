import { describe, expect, it } from "vitest";
import { validateTransaction } from "./validate";
import { parseSimulation } from "./mock-parser";
import { jakartaDaysAgoN, jakartaTodayISO } from "@/lib/time";

/**
 * Unit test validasi tanggal transaksi (Perbaikan Prioritas 1).
 *
 * Regresi yang dijaga (audit /api/assistant/chat):
 * - validate.ts tidak boleh MELEMPAR exception untuk tanggal yang formatnya
 *   YYYY-MM-DD tetapi tidak ada di kalender (dulu: RangeError → HTTP 500).
 * - Tanggal mustahil DITOLAK dengan pesan jelas, bukan digeser diam-diam.
 * - Tanggal valid TIDAK BERUBAH oleh proses validasi.
 */

const CALENDAR_ERROR = "Tanggal transaksi tidak valid (bulan atau tanggalnya tidak ada di kalender).";
const FORMAT_ERROR = "Format tanggal harus YYYY-MM-DD.";
const FUTURE_ERROR = "Tanggal transaksi tidak boleh di masa depan.";

/** Transaksi lengkap valid — hanya transacted_at yang diubah per test */
function makeTx(transactedAt: unknown) {
  return {
    type: "income",
    title: "Kaos",
    quantity: 3,
    unit_price: 75000,
    payment_method: "cash",
    transacted_at: transactedAt,
    notes: "",
  };
}

describe("validateTransaction — tanggal VALID", () => {
  it("tanggal valid di masa lalu diterima dan TIDAK BERUBAH", () => {
    const res = validateTransaction(makeTx("2024-03-15"));
    expect(res.valid).toBe(true);
    expect(res.data?.transacted_at).toBe("2024-03-15");
    // 12:00 WIB → 05:00 UTC (tetap, tidak digeser)
    expect(res.data?.transacted_at_iso).toBe("2024-03-15T05:00:00.000Z");
  });

  it("hari ini diterima (batas bawah tanggal yang diizinkan)", () => {
    const today = jakartaTodayISO();
    const res = validateTransaction(makeTx(today));
    expect(res.valid).toBe(true);
    expect(res.data?.transacted_at).toBe(today);
    expect(res.errors).not.toContain(FUTURE_ERROR);
  });

  it("null / undefined / string kosong → default hari ini (perilaku lama)", () => {
    for (const empty of [null, undefined, ""]) {
      const res = validateTransaction(makeTx(empty));
      expect(res.valid).toBe(true);
      expect(res.data?.transacted_at).toBe(jakartaTodayISO());
    }
  });

  it("kasus batas kalender yang valid", () => {
    const validDays = [
      "2024-01-01", // tahun baru
      "2024-12-31", // akhir tahun
      "2024-02-28", // hari terakhir Februari non-kabisat
      "2024-02-29", // kabisat (÷4)
      "2000-02-29", // kabisat abad (÷400)
      "2024-04-30", // hari terakhir April
      "2024-06-30", // hari terakhir Juni
    ];
    for (const day of validDays) {
      const res = validateTransaction(makeTx(day));
      expect(res.valid, `harusnya valid: ${day}`).toBe(true);
      expect(res.data?.transacted_at).toBe(day);
    }
  });
});

describe("validateTransaction — tanggal TIDAK VALID (tidak ada di kalender)", () => {
  const invalidDays = [
    "2026-13-45", // bulan 13 + tanggal 45 (kasus audit)
    "2026-13-01", // bulan 13
    "2025-13-01", // bulan 13, tahun lampau (kasus audit)
    "2026-00-10", // bulan 00 (kasus audit)
    "2026-10-00", // tanggal 00 (kasus audit)
    "2026-02-30", // 30 Februari
    "2026-02-31", // 31 Februari
    "2026-04-31", // 31 April
    "2026-06-31", // 31 Juni
    "2026-09-31", // 31 September
    "2026-02-29", // 29 Feb tahun non-kabisat
    "2100-02-29", // 29 Feb abad non-kabisat (÷100 bukan ÷400)
    "1900-02-29", // 29 Feb abad non-kabisat
  ];

  for (const day of invalidDays) {
    it(`ditolak tanpa exception: ${day}`, () => {
      let res: ReturnType<typeof validateTransaction> | null = null;
      expect(() => {
        res = validateTransaction(makeTx(day));
      }).not.toThrow();
      expect(res!.valid).toBe(false);
      expect(res!.data).toBeNull(); // tidak ada tanggal yang digeser diam-diam
      expect(res!.errors).toContain(CALENDAR_ERROR);
    });
  }

  it("2026-02-30 tidak lagi digeser diam-diam ke Maret", () => {
    const res = validateTransaction(makeTx("2026-02-30"));
    expect(res.valid).toBe(false);
    expect(res.data).toBeNull();
  });
});

describe("validateTransaction — format tanggal SALAH", () => {
  const badFormats: unknown[] = [
    "31-10-2026", // DD-MM-YYYY
    "2026/10/31", // pemisah salah
    "2026-1-5", // digit tunggal
    "20261031", // tanpa pemisah
    "2026-10-31T00:00:00Z", // timestamp penuh
    "2024-03-15 ", // spasi ekor
    "kemarin", // teks bebas
    "31 Oktober 2026", // format lokal
    20261031, // angka, bukan string
  ];

  for (const raw of badFormats) {
    it(`menolak dengan pesan format: ${JSON.stringify(raw)}`, () => {
      const res = validateTransaction(makeTx(raw));
      expect(res.valid).toBe(false);
      expect(res.errors).toContain(FORMAT_ERROR);
    });
  }
});

describe("validateTransaction — tanggal masa depan", () => {
  it("besok ditolak sebagai masa depan (tanggal valid, bukan tanggal mustahil)", () => {
    const tomorrow = jakartaDaysAgoN(-1);
    const res = validateTransaction(makeTx(tomorrow));
    expect(res.valid).toBe(false);
    expect(res.errors).toContain(FUTURE_ERROR);
    expect(res.errors).not.toContain(CALENDAR_ERROR);
  });
});

describe("validateTransaction — perilaku fitur lain TETAP", () => {
  it("transaksi lengkap valid: total dihitung di server, field tidak berubah", () => {
    const res = validateTransaction({
      type: "expense",
      title: "Beli kopi",
      quantity: 2,
      unit_price: 180000,
      payment_method: "transfer",
      transacted_at: "2024-03-15",
      notes: "kontan",
    });
    expect(res.valid).toBe(true);
    expect(res.data).toMatchObject({
      type: "expense",
      title: "Beli kopi",
      quantity: 2,
      unit_price: 180000,
      payment_method: "transfer",
      transacted_at: "2024-03-15",
      notes: "kontan",
      total: 360000,
    });
  });

  it("harga format Indonesia '75.000' tetap dinormalisasi menjadi 75000", () => {
    const res = validateTransaction({ ...makeTx("2024-03-15"), unit_price: "75.000" });
    expect(res.valid).toBe(true);
    expect(res.data?.unit_price).toBe(75000);
    expect(res.data?.total).toBe(225000);
  });

  it("error lain tetap terkumpulkan bersama error tanggal", () => {
    const res = validateTransaction({
      type: "salah",
      title: "",
      quantity: 0,
      unit_price: -1,
      payment_method: "bitcoin",
      transacted_at: "2026-13-45",
      notes: "x".repeat(501),
    });
    expect(res.valid).toBe(false);
    expect(res.errors.length).toBeGreaterThanOrEqual(6);
    expect(res.errors).toContain(CALENDAR_ERROR);
  });
});

describe("regresi audit: mock-parser → validator tidak crash", () => {
  it("pesan berisi tanggal mustahil diproses tanpa exception", () => {
    const parsed = parseSimulation("jual 2 roti Rp20.000 2026-13-45");
    expect(parsed.transaction?.transacted_at).toBe("2026-13-45");

    let res: ReturnType<typeof validateTransaction> | null = null;
    expect(() => {
      res = validateTransaction(parsed.transaction);
    }).not.toThrow();
    expect(res!.valid).toBe(false);
    expect(res!.errors).toContain(CALENDAR_ERROR);
  });

  it("pesan berisi 30 Februari ditolak, bukan digeser ke Maret", () => {
    const parsed = parseSimulation("jual 2 roti Rp20.000 2026-02-30");
    expect(parsed.transaction?.transacted_at).toBe("2026-02-30");

    const res = validateTransaction(parsed.transaction);
    expect(res.valid).toBe(false);
    expect(res.data).toBeNull();
    expect(res.errors).toContain(CALENDAR_ERROR);
  });

  it("pesan transaksi normal tetap menghasilkan draf valid (perilaku lama)", () => {
    const parsed = parseSimulation("Saya menjual 3 kaos seharga Rp75.000 per buah");
    expect(parsed.action_type).toBe("transaction_ready");
    expect(parsed.transaction?.transacted_at).toBeNull();

    const res = validateTransaction(parsed.transaction);
    expect(res.valid).toBe(true);
    expect(res.data?.transacted_at).toBe(jakartaTodayISO());
    expect(res.data?.total).toBe(225000);
  });
});
