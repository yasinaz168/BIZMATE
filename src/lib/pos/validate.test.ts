import { describe, expect, it } from "vitest";
import {
  MAX_CHECKOUT_ITEMS,
  NOTES_MAX,
  QUANTITY_MAX,
  validateCheckout,
} from "./validate";

/**
 * Pengujian validator checkout POS (Tahap P5.1).
 *
 * Dijaga:
 * - Checkout valid → data ternormalisasi (request_id, payment_method,
 *   items, notes).
 * - UUID valid (request_id & product_id) — format salah ditolak.
 * - payment_method wajib & terbatas 4 nilai.
 * - items: array 1..100, quantity > 0 (setelah pembulatan 2 desimal),
 *   ≤ batas numeric(12,2).
 * - notes: null / string ≤ 500.
 * - Field tak berwenang dari klien (business_id, harga, nama, total)
 *   TIDAK dipakai dan TIDAK muncul di hasil.
 */

const UUID_A = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
const UUID_B = "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e";
const UUID_C = "c3d4e5f6-a7b8-4c9d-8e0f-2a3b4c5d6e7f";

function makeCheckout(fields: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    request_id: UUID_A,
    payment_method: "cash",
    items: [
      { product_id: UUID_B, quantity: 2 },
      { product_id: UUID_C, quantity: 1 },
    ],
    notes: null,
    ...fields,
  };
}

describe("validateCheckout — checkout valid", () => {
  it("checkout lengkap valid → data ternormalisasi", () => {
    const res = validateCheckout(makeCheckout({ notes: "  bungkus dua  " }));
    expect(res.valid).toBe(true);
    expect(res.data).toEqual({
      request_id: UUID_A,
      payment_method: "cash",
      items: [
        { product_id: UUID_B, quantity: 2 },
        { product_id: UUID_C, quantity: 1 },
      ],
      notes: "bungkus dua",
    });
  });

  it("checkout minimal tanpa notes → notes null", () => {
    const res = validateCheckout({
      request_id: UUID_A,
      payment_method: "transfer",
      items: [{ product_id: UUID_B, quantity: 1 }],
    });
    expect(res.valid).toBe(true);
    expect(res.data?.notes).toBeNull();
  });

  it("notes null eksplisit → valid", () => {
    const res = validateCheckout(makeCheckout({ notes: null }));
    expect(res.valid).toBe(true);
    expect(res.data?.notes).toBeNull();
  });

  it("quantity desimal (kas) & format angka diterima", () => {
    const res = validateCheckout({
      request_id: UUID_A,
      payment_method: "qris",
      items: [{ product_id: UUID_B, quantity: 1.5 }],
    });
    expect(res.valid).toBe(true);
    expect(res.data?.items[0].quantity).toBe(1.5);
  });

  it("quantity string format Indonesia diterima ('1.234,5' → 1234.5)", () => {
    const res = validateCheckout({
      request_id: UUID_A,
      payment_method: "cash",
      items: [{ product_id: UUID_B, quantity: "1.234,5" }],
    });
    expect(res.valid).toBe(true);
    expect(res.data?.items[0].quantity).toBe(1234.5);
  });

  it("duplikat product_id lolos validasi — agregasi jadi tugas RPC", () => {
    const res = validateCheckout({
      request_id: UUID_A,
      payment_method: "cash",
      items: [
        { product_id: UUID_B, quantity: 1 },
        { product_id: UUID_B, quantity: 2 },
      ],
    });
    expect(res.valid).toBe(true);
  });
});

describe("validateCheckout — request_id", () => {
  it("request_id bukan UUID → ditolak", () => {
    for (const bad of ["bukan-uuid", "123", "a1b2c3d4e5f6", "XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"]) {
      const res = validateCheckout(makeCheckout({ request_id: bad }));
      expect(res.valid, `ditolak: ${String(bad)}`).toBe(false);
      expect(res.errors).toContain("request_id harus berupa UUID yang valid.");
    }
  });

  it("request_id kosong / tidak ada → 'wajib diisi'", () => {
    for (const bad of ["", "   ", null, undefined]) {
      const res = validateCheckout(makeCheckout({ request_id: bad }));
      expect(res.valid).toBe(false);
      expect(res.errors).toContain("request_id wajib diisi.");
    }
  });
});

describe("validateCheckout — payment_method", () => {
  it("metode tidak dikenal → ditolak", () => {
    for (const bad of ["bitcoin", "kartu", 123, true, {}]) {
      const res = validateCheckout(makeCheckout({ payment_method: bad }));
      expect(res.valid, `ditolak: ${String(bad)}`).toBe(false);
      expect(res.errors).toContain("Metode pembayaran tidak valid.");
    }
  });

  it("payment_method kosong / tidak ada → 'wajib diisi'", () => {
    for (const bad of ["", "   ", null, undefined]) {
      const res = validateCheckout(makeCheckout({ payment_method: bad }));
      expect(res.valid).toBe(false);
      expect(res.errors).toContain("Metode pembayaran wajib diisi.");
    }
  });
});

describe("validateCheckout — items", () => {
  it("items kosong → ditolak", () => {
    for (const items of [[], null, undefined]) {
      const res = validateCheckout(makeCheckout({ items }));
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes("Keranjang") || e.includes("array"))).toBe(true);
    }
  });

  it("items bukan array → ditolak", () => {
    const res = validateCheckout(makeCheckout({ items: "bukan array" }));
    expect(res.valid).toBe(false);
    expect(res.errors).toContain("Daftar item harus berupa array.");
  });

  it("items lebih dari 100 → ditolak", () => {
    const items = Array.from({ length: MAX_CHECKOUT_ITEMS + 1 }, (_, i) => ({
      product_id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      quantity: 1,
    }));
    const res = validateCheckout(makeCheckout({ items }));
    expect(res.valid).toBe(false);
    expect(res.errors).toContain(`Maksimal ${MAX_CHECKOUT_ITEMS} item dalam satu transaksi.`);
  });

  it("tepat 100 item → valid", () => {
    const items = Array.from({ length: MAX_CHECKOUT_ITEMS }, (_, i) => ({
      product_id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      quantity: 1,
    }));
    const res = validateCheckout(makeCheckout({ items }));
    expect(res.valid).toBe(true);
    expect(res.data?.items).toHaveLength(MAX_CHECKOUT_ITEMS);
  });

  it("product_id tidak valid / kosong / tidak ada → ditolak dengan label posisi", () => {
    for (const bad of ["bukan-uuid", "123", "", null, undefined, 42]) {
      const res = validateCheckout({
        request_id: UUID_A,
        payment_method: "cash",
        items: [{ product_id: UUID_B, quantity: 1 }, { product_id: bad, quantity: 1 }],
      });
      expect(res.valid, `ditolak: ${String(bad)}`).toBe(false);
      expect(res.errors.some((e) => e.includes("Item ke-2") && e.includes("product_id"))).toBe(true);
    }
  });

  it("item bukan objek (string/angka/null) → ditolak", () => {
    const res = validateCheckout(makeCheckout({ items: ["bukan-objek"] }));
    expect(res.valid).toBe(false);
    expect(res.errors).toContain("Item ke-1 tidak valid.");
  });
});

describe("validateCheckout — quantity", () => {
  it("quantity nol → ditolak", () => {
    const res = validateCheckout(
      makeCheckout({ items: [{ product_id: UUID_B, quantity: 0 }] })
    );
    expect(res.valid).toBe(false);
    expect(res.errors).toContain("Item ke-1: quantity harus lebih besar dari 0.");
  });

  it("quantity negatif → ditolak", () => {
    for (const bad of [-1, -0.5, "-100"]) {
      const res = validateCheckout(
        makeCheckout({ items: [{ product_id: UUID_B, quantity: bad }] })
      );
      expect(res.valid).toBe(false);
      expect(res.errors).toContain("Item ke-1: quantity harus lebih besar dari 0.");
    }
  });

  it("quantity format salah (termasuk NaN/Infinity) → ditolak", () => {
    for (const bad of ["abc", "1.2.3", "12a", NaN, Infinity, -Infinity, {}, true]) {
      const res = validateCheckout(
        makeCheckout({ items: [{ product_id: UUID_B, quantity: bad }] })
      );
      expect(res.valid, `ditolak: ${String(bad)}`).toBe(false);
      expect(res.errors).toContain("Item ke-1: quantity wajib angka yang valid.");
    }
  });

  it("quantity melebihi batas numeric(12,2) → ditolak", () => {
    const res = validateCheckout(
      makeCheckout({ items: [{ product_id: UUID_B, quantity: QUANTITY_MAX + 0.01 }] })
    );
    expect(res.valid).toBe(false);
    expect(res.errors).toContain("Item ke-1: quantity melebihi batas.");
  });

  it("tepat batas numeric(12,2) → valid", () => {
    const res = validateCheckout(
      makeCheckout({ items: [{ product_id: UUID_B, quantity: QUANTITY_MAX }] })
    );
    expect(res.valid).toBe(true);
    expect(res.data?.items[0].quantity).toBe(QUANTITY_MAX);
  });

  it("quantity lebih dari 2 desimal → dibulatkan 2 desimal (3.14159 → 3.14)", () => {
    const res = validateCheckout(
      makeCheckout({ items: [{ product_id: UUID_B, quantity: 3.14159 }] })
    );
    expect(res.valid).toBe(true);
    expect(res.data?.items[0].quantity).toBe(3.14);
  });

  it("quantity sangat kecil membulat ke 0 → ditolak (bukan lolos sebagai 0)", () => {
    const res = validateCheckout(
      makeCheckout({ items: [{ product_id: UUID_B, quantity: 0.004 }] })
    );
    expect(res.valid).toBe(false);
    expect(res.errors).toContain("Item ke-1: quantity harus lebih besar dari 0.");
  });
});

describe("validateCheckout — notes", () => {
  it("notes lebih dari 500 karakter → ditolak", () => {
    const res = validateCheckout(makeCheckout({ notes: "n".repeat(NOTES_MAX + 1) }));
    expect(res.valid).toBe(false);
    expect(res.errors).toContain(`Catatan maksimal ${NOTES_MAX} karakter.`);
  });

  it("notes tepat 500 karakter → valid", () => {
    const res = validateCheckout(makeCheckout({ notes: "n".repeat(NOTES_MAX) }));
    expect(res.valid).toBe(true);
  });

  it("notes kosong → dinormalisasi jadi null", () => {
    const res = validateCheckout(makeCheckout({ notes: "   " }));
    expect(res.valid).toBe(true);
    expect(res.data?.notes).toBeNull();
  });

  it("notes non-teks → ditolak", () => {
    const res = validateCheckout(makeCheckout({ notes: 123 }));
    expect(res.valid).toBe(false);
    expect(res.errors).toContain("Catatan harus berupa teks.");
  });
});

describe("validateCheckout — input tidak lengkap / tipe salah", () => {
  it("input kosong → semua error wajib terkumpul", () => {
    const res = validateCheckout({});
    expect(res.valid).toBe(false);
    expect(res.errors).toContain("request_id wajib diisi.");
    expect(res.errors).toContain("Metode pembayaran wajib diisi.");
    expect(res.errors).toContain("Daftar item harus berupa array.");
    expect(res.data).toBeNull();
  });

  it("bukan objek → 'Data checkout tidak valid.'", () => {
    for (const raw of [null, undefined, "teks", 42, true, [1, 2]]) {
      const res = validateCheckout(raw);
      expect(res.valid).toBe(false);
      expect(res.errors).toEqual(["Data checkout tidak valid."]);
      expect(res.data).toBeNull();
    }
  });

  it("field tak berwenang dari klien diabaikan (tidak masuk hasil)", () => {
    const res = validateCheckout(
      makeCheckout({
        business_id: UUID_B, // penyelundupan business_id
        items: [
          {
            product_id: UUID_B,
            quantity: 2,
            selling_price: 999999999,
            product_name: "PRODUK PALSU",
            total: 999999999,
            subtotal: 999999999,
          },
        ],
      })
    );
    expect(res.valid).toBe(true);
    // Hanya product_id + quantity yang diakui; tidak ada harga/nama/total klien
    expect(res.data?.items[0]).toEqual({ product_id: UUID_B, quantity: 2 });
    expect(Object.keys(res.data?.items[0] ?? {})).toEqual(["product_id", "quantity"]);
    expect(JSON.stringify(res.data)).not.toContain("PRODUK PALSU");
    expect(JSON.stringify(res.data)).not.toContain("999999999");
    expect(res.data).not.toHaveProperty("business_id");
    expect(res.data).not.toHaveProperty("total");
  });

  it("beberapa error sekaligus terkumpul (bukan berhenti di pertama)", () => {
    const res = validateCheckout({
      request_id: "bukan-uuid",
      payment_method: "bitcoin",
      items: [{ product_id: "salah", quantity: -2 }],
    });
    expect(res.valid).toBe(false);
    expect(res.errors.length).toBeGreaterThanOrEqual(3);
  });
});
