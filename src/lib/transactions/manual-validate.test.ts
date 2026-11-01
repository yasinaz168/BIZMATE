import { describe, expect, it } from "vitest";
import {
  isSameManualPayload,
  MAX_MONEY,
  MAX_QUANTITY,
  parseIdNumber,
  round2,
  validateManualTransaction,
} from "./manual-validate";

const REQUEST_ID = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";

/** Input dasar yang valid — di-overwrite per kasus */
function input(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: "income",
    title: "Penjualan gula 5 kg",
    quantity: "5",
    unitPrice: "12500",
    paymentMethod: "cash",
    transactedAt: "2026-10-30",
    notes: "",
    requestId: REQUEST_ID,
    ...overrides,
  };
}

describe("validateManualTransaction — kasus valid", () => {
  it("pemasukan manual valid → data lengkap, total dihitung server", () => {
    const result = validateManualTransaction(input());
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.data?.type).toBe("income");
    expect(result.data?.title).toBe("Penjualan gula 5 kg");
    expect(result.data?.quantity).toBe(5);
    expect(result.data?.unitPrice).toBe(12500);
    expect(result.data?.total).toBe(62500); // SERVER, bukan dari raw browser
    expect(result.data?.transactedAtDay).toBe("2026-10-30");
    // 2026-10-30 pukul 12:00 WIB → ISO UTC 05:00 (hari yang sama, aman dari pergeseran)
    expect(result.data?.transactedAtIso).toBe("2026-10-30T05:00:00.000Z");
    expect(result.data?.paymentMethod).toBe("cash");
    expect(result.data?.notes).toBe("");
    expect(result.data?.requestId).toBe(REQUEST_ID); // R2 — idempotency
  });

  it("pengeluaran valid dengan metode non-default", () => {
    const result = validateManualTransaction(
      input({ type: "expense", paymentMethod: "ewallet", quantity: "2,5", unitPrice: "75.000,25" })
    );
    expect(result.valid).toBe(true);
    expect(result.data?.type).toBe("expense");
    expect(result.data?.paymentMethod).toBe("ewallet");
    expect(result.data?.quantity).toBe(2.5); // format Indonesia
    expect(result.data?.unitPrice).toBe(75000.25);
    expect(result.data?.total).toBe(187500.63); // 2.5 × 75000.25 = 187500.625 → 187500.63
  });

  it("angka number asli diterima apa adanya", () => {
    const result = validateManualTransaction(
      input({ quantity: 3, unitPrice: 1000.55 })
    );
    expect(result.data?.total).toBe(3001.65); // 3 × 1000.55
  });

  it("tanggal lama (lampau) valid", () => {
    expect(validateManualTransaction(input({ transactedAt: "2020-01-15" })).valid).toBe(
      true
    );
  });
});

describe("validateManualTransaction — penolakan", () => {
  it("quantity tidak valid: kosong, NaN-string, 0, negatif, non-angka", () => {
    for (const raw of ["", "  ", "abc", "0", "-2", null, undefined]) {
      const result = validateManualTransaction(input({ quantity: raw }));
      expect(result.valid).toBe(false);
      expect(result.errors.join(" ")).toMatch(/jumlah/i);
    }
  });

  it("harga satuan negatif ditolak", () => {
    const result = validateManualTransaction(input({ unitPrice: "-500" }));
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toMatch(/harga/i);
  });

  it("quantity & harga melebihi presisi kolom database ditolak", () => {
    const bigQty = validateManualTransaction(
      input({ quantity: 90000000000 }) // > numeric(12,2)
    );
    expect(bigQty.valid).toBe(false);
    expect(bigQty.errors.join(" ")).toMatch(/jumlah/i);
    expect(MAX_QUANTITY).toBe(9999999999.99);

    const bigPrice = validateManualTransaction(
      input({ unitPrice: 1000000000000 }) // > numeric(14,2)
    );
    expect(bigPrice.valid).toBe(false);
    expect(bigPrice.errors.join(" ")).toMatch(/harga/i);
    expect(MAX_MONEY).toBe(999999999999.99);
  });

  it("total melebihi numeric(14,2) ditolak", () => {
    const result = validateManualTransaction(
      input({ quantity: MAX_QUANTITY, unitPrice: MAX_MONEY })
    );
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toMatch(/total/i);
  });

  it("total melewati tepat batas numeric(14,2) diterima", () => {
    // tepat di batas kolom masih sah (nilai angka, bukan format ribuan)
    const ok = validateManualTransaction(
      input({ quantity: 1, unitPrice: 999999999999.99 })
    );
    expect(ok.valid).toBe(true);
    expect(ok.data?.total).toBe(999999999999.99);
  });

  it("metode pembayaran tak dikenal ditolak", () => {
    for (const bad of ["kartu", "", "CASH", 123]) {
      const result = validateManualTransaction(input({ paymentMethod: bad }));
      expect(result.valid).toBe(false);
      expect(result.errors.join(" ")).toMatch(/metode/i);
    }
  });

  it("tanggal tidak valid: bentuk, kalender mustahil, masa depan", () => {
    for (const rawDate of ["", "bukan-tanggal", "2026-1-5", "2026-02-30", "2026-13-45"]) {
      const result = validateManualTransaction(input({ transactedAt: rawDate }));
      expect(result.valid).toBe(false);
      expect(result.errors.join(" ")).toMatch(/tanggal/i);
    }
    // masa depan (setelah hari ini kalender Jakarta) ditolak
    const future = validateManualTransaction(input({ transactedAt: "2099-01-01" }));
    expect(future.valid).toBe(false);
    expect(future.errors.join(" ")).toMatch(/masa depan/i);
  });

  it("notes lebih dari 500 karakter ditolak", () => {
    const result = validateManualTransaction(
      input({ notes: "x".repeat(501) })
    );
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toMatch(/catatan/i);
  });

  it("keterangan kosong/terlalu panjang ditolak", () => {
    const empty = validateManualTransaction(input({ title: "   " }));
    expect(empty.valid).toBe(false);
    expect(empty.errors.join(" ")).toMatch(/keterangan/i);

    const long = validateManualTransaction(input({ title: "a".repeat(161) }));
    expect(long.valid).toBe(false);
    expect(long.errors.join(" ")).toMatch(/160/i);
  });

  it("jenis selain income/expense ditolak", () => {
    expect(validateManualTransaction(input({ type: "refund" })).valid).toBe(false);
    expect(validateManualTransaction(input({ type: "" })).valid).toBe(false);
  });
});

describe("helper angka (format Indonesia, konsisten dengan validator AI)", () => {
  it("parseIdNumber", () => {
    expect(parseIdNumber("75.000")).toBe(75000);
    expect(parseIdNumber("1.500,5")).toBe(1500.5);
    expect(parseIdNumber("Rp 2.000")).toBe(2000);
    expect(parseIdNumber("abc")).toBeNaN();
    expect(parseIdNumber("Infinity")).toBeNaN(); // Infinity ditolak
    expect(parseIdNumber(Number.NaN)).toBeNaN();
    expect(parseIdNumber(Infinity)).toBeNaN();
  });

  it("round2 presisi numeric(…,2)", () => {
    expect(round2(10.005)).toBe(10.01);
    expect(round2(2.5 * 75000.25)).toBe(187500.63);
  });
});

describe("request_id — idempotency (R2)", () => {
  it("UUID valid diterima dan masuk hasil normalisasi", () => {
    const res = validateManualTransaction(input({ requestId: REQUEST_ID }));
    expect(res.valid).toBe(true);
    expect(res.data?.requestId).toBe(REQUEST_ID);
  });

  it("UUID valid dengan spasi di pinggir dipangkas", () => {
    const res = validateManualTransaction(
      input({ requestId: `  ${REQUEST_ID}  ` })
    );
    expect(res.valid).toBe(true);
    expect(res.data?.requestId).toBe(REQUEST_ID);
  });

  it("kosong / hilang / bukan string → ditolak 'request_id wajib diisi.'", () => {
    for (const bad of ["", "   ", null, undefined, 12345]) {
      const res = validateManualTransaction(input({ requestId: bad }));
      expect(res.valid).toBe(false);
      expect(res.errors).toContain("request_id wajib diisi.");
    }
  });

  it("bentuk bukan UUID → ditolak 'UUID yang valid' (pola pos/validate)", () => {
    for (const bad of ["bukan-uuid", "12345", "a1b2c3d4-e5f6-4a7b-8c9d", "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"]) {
      const res = validateManualTransaction(input({ requestId: bad }));
      expect(res.valid).toBe(false);
      expect(res.errors).toContain("request_id harus berupa UUID yang valid.");
    }
  });

  it("request_id tidak mengubah aturan validasi field lain", () => {
    // field lain tetap divalidasi persis seperti sebelumnya
    const res = validateManualTransaction(
      input({ requestId: REQUEST_ID, quantity: "-1", title: "" })
    );
    expect(res.valid).toBe(false);
    expect(res.errors).toContain("Jumlah harus lebih dari 0.");
    expect(res.errors).toContain("Keterangan transaksi wajib diisi.");
  });
});

describe("isSameManualPayload — pembanding payload idempotency (R2)", () => {
  const base = () =>
    validateManualTransaction(input({ notes: "" })).data!;

  it("payload identik → true", () => {
    expect(isSameManualPayload(base(), base())).toBe(true);
  });

  it("variasi input angka yang ternormalisasi sama → true", () => {
    const a = validateManualTransaction(
      input({ quantity: 5, unitPrice: "12.500" })
    ).data!;
    const b = validateManualTransaction(
      input({ quantity: "5", unitPrice: "12500" })
    ).data!;
    expect(isSameManualPayload(a, b)).toBe(true);
  });

  it("nilai dari baris DB (string desimal) dibandingkan desimal-safe", () => {
    const a = validateManualTransaction(input({ quantity: 5 })).data!;
    const b = { ...a, quantity: "5.00" as unknown as number };
    expect(isSameManualPayload(a, b)).toBe(true);
  });

  it("notes kosong ≡ null ≡ spasi (edge-case null vs string kosong)", () => {
    const withEmpty = validateManualTransaction(input({ notes: "" })).data!;
    const withNull = { ...withEmpty, notes: null };
    const withSpaces = validateManualTransaction(input({ notes: "   " })).data!;
    expect(isSameManualPayload(withEmpty, withNull)).toBe(true);
    expect(isSameManualPayload(withNull, withEmpty)).toBe(true);
    expect(isSameManualPayload(withEmpty, withSpaces)).toBe(true);
  });

  it("notes berisi → harus persis sama (setelah trim normalisasi)", () => {
    const a = validateManualTransaction(input({ notes: "okt-okt" })).data!;
    const b = validateManualTransaction(input({ notes: "  okt-okt  " })).data!;
    const c = validateManualTransaction(input({ notes: "lain" })).data!;
    expect(isSameManualPayload(a, b)).toBe(true); // trim normalisasi validator
    expect(isSameManualPayload(a, c)).toBe(false);
  });

  it("perbedaan field → false (type, title, quantity, harga, total, tanggal, metode)", () => {
    const a = base();
    expect(isSameManualPayload(a, { ...a, type: "expense" })).toBe(false);
    expect(isSameManualPayload(a, { ...a, title: "Judul lain" })).toBe(false);
    expect(isSameManualPayload(a, { ...a, quantity: 6 })).toBe(false);
    expect(isSameManualPayload(a, { ...a, unitPrice: 12501 })).toBe(false);
    expect(isSameManualPayload(a, { ...a, total: 62501 })).toBe(false);
    expect(
      isSameManualPayload(a, {
        ...a,
        transactedAtIso: "2026-10-29T05:00:00.000Z",
      })
    ).toBe(false);
    expect(isSameManualPayload(a, { ...a, paymentMethod: "qris" })).toBe(false);
  });

  it("title setara setelah trim — normalisasi validator", () => {
    const a = base();
    expect(
      isSameManualPayload(a, { ...a, title: "  Penjualan gula 5 kg  " })
    ).toBe(true);
    expect(isSameManualPayload(a, { ...a, title: "Penjualan gula 6 kg" })).toBe(
      false
    );
  });

  it("nilai null/undefined → false (tidak ada pembandingan yang menggantung)", () => {
    const a = base();
    expect(isSameManualPayload(null, a)).toBe(false);
    expect(isSameManualPayload(a, null)).toBe(false);
    expect(isSameManualPayload(null, null)).toBe(false);
  });
});
