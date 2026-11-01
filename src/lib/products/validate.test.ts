import { describe, expect, it } from "vitest";
import {
  NUMERIC_MAX,
  PRODUCT_CATEGORY_MAX,
  PRODUCT_NAME_MAX,
  PRODUCT_UNIT_MAX,
  validateProduct,
} from "./validate";

/**
 * Pengujian validator produk (Tahap P1).
 *
 * Dijaga:
 * - Nama wajib, trim, 1..160 karakter.
 * - Kategori opsional, maksimal 80 karakter.
 * - Harga jual wajib, tidak negatif, dibulatkan 2 desimal.
 * - Harga modal & stok opsional, tidak negatif.
 * - Satuan opsional dengan panjang wajar.
 * - Normalisasi angka aman: NaN/Infinity/format salah → ditolak.
 * - Pesan error dalam Bahasa Indonesia.
 */

const HARGA = { name: "Kopi", selling_price: 15000 };

describe("validateProduct — input dasar valid", () => {
  it("input lengkap valid → data ternormalisasi", () => {
    const res = validateProduct({
      name: "  Kopi Bubuk 250gr  ",
      category: "  Makanan  ",
      selling_price: 45000,
      unit_cost: 30000,
      stock: 12.5,
      unit: "  pack  ",
      is_active: false,
    });
    expect(res.valid).toBe(true);
    expect(res.data).toEqual({
      name: "Kopi Bubuk 250gr",
      category: "Makanan",
      selling_price: 45000,
      unit_cost: 30000,
      stock: 12.5,
      unit: "pack",
      is_active: false,
    });
  });

  it("input minimal (name + selling_price) → opsional jadi null, is_active default true", () => {
    const res = validateProduct(HARGA);
    expect(res.valid).toBe(true);
    expect(res.data).toEqual({
      name: "Kopi",
      category: null,
      selling_price: 15000,
      unit_cost: null,
      stock: null,
      unit: null,
      is_active: true,
    });
  });

  it("harga jual 0 sah (tidak negatif)", () => {
    const res = validateProduct({ ...HARGA, selling_price: 0 });
    expect(res.valid).toBe(true);
    expect(res.data?.selling_price).toBe(0);
  });
});

describe("validateProduct — nama", () => {
  it("nama kosong / hanya spasi → error 'wajib diisi'", () => {
    for (const name of ["", "   "]) {
      const res = validateProduct({ ...HARGA, name });
      expect(res.valid).toBe(false);
      expect(res.errors).toContain("Nama produk wajib diisi.");
    }
  });

  it("nama tidak ada sama sekali → error", () => {
    const res = validateProduct({ selling_price: 1000 });
    expect(res.valid).toBe(false);
    expect(res.errors).toContain("Nama produk wajib diisi.");
  });

  it("batas panjang nama: 1 dan 160 sah, 161 ditolak", () => {
    expect(validateProduct({ ...HARGA, name: "a" }).valid).toBe(true);
    expect(validateProduct({ ...HARGA, name: "a".repeat(PRODUCT_NAME_MAX) }).valid).toBe(true);
    const lewat = validateProduct({ ...HARGA, name: "a".repeat(PRODUCT_NAME_MAX + 1) });
    expect(lewat.valid).toBe(false);
    expect(lewat.errors).toContain(`Nama produk maksimal ${PRODUCT_NAME_MAX} karakter.`);
  });

  it("nama di-trim sebelum dihitung panjangnya", () => {
    const res = validateProduct({ ...HARGA, name: `  ${"a".repeat(160)}  ` });
    expect(res.valid).toBe(true);
    expect(res.data?.name).toBe("a".repeat(160));
  });

  it("nama non-teks (angka) → error wajib diisi", () => {
    const res = validateProduct({ ...HARGA, name: 123 });
    expect(res.valid).toBe(false);
    expect(res.errors).toContain("Nama produk wajib diisi.");
  });
});

describe("validateProduct — kategori (opsional)", () => {
  it("kosong/null → null tanpa error", () => {
    for (const category of [null, undefined, "", "   "]) {
      const res = validateProduct({ ...HARGA, category });
      expect(res.valid).toBe(true);
      expect(res.data?.category).toBeNull();
    }
  });

  it("batas panjang kategori: 80 sah, 81 ditolak", () => {
    expect(
      validateProduct({ ...HARGA, category: "c".repeat(PRODUCT_CATEGORY_MAX) }).valid
    ).toBe(true);
    const lewat = validateProduct({ ...HARGA, category: "c".repeat(PRODUCT_CATEGORY_MAX + 1) });
    expect(lewat.valid).toBe(false);
    expect(lewat.errors).toContain(`Kategori produk maksimal ${PRODUCT_CATEGORY_MAX} karakter.`);
  });

  it("kategori non-teks (angka) → error", () => {
    const res = validateProduct({ ...HARGA, category: 123 });
    expect(res.valid).toBe(false);
    expect(res.errors).toContain("Kategori produk harus berupa teks.");
  });
});

describe("validateProduct — harga jual (wajib)", () => {
  it("input kosong (undefined/null/'') → error 'wajib diisi'", () => {
    for (const price of [undefined, null, ""]) {
      const res = validateProduct({ name: "Kopi", selling_price: price });
      expect(res.valid).toBe(false);
      expect(res.errors).toContain("Harga jual wajib diisi.");
    }
  });

  it("format angka salah → error 'angka yang valid'", () => {
    for (const price of ["abc", "1.2.3", "12a", "Rpabc", {}, [], true, NaN, Infinity, -Infinity]) {
      const res = validateProduct({ ...HARGA, selling_price: price });
      expect(res.valid, `seharusnya ditolak: ${String(price)}`).toBe(false);
      expect(res.errors).toContain("Harga jual wajib angka yang valid.");
    }
  });

  it("angka negatif → error 'tidak boleh negatif'", () => {
    for (const price of [-1, -0.5, "-100", "-75.000"]) {
      const res = validateProduct({ ...HARGA, selling_price: price });
      expect(res.valid).toBe(false);
      expect(res.errors).toContain("Harga jual tidak boleh negatif.");
    }
  });

  it("normalisasi format angka Indonesia & standar", () => {
    const kasus: Array<[unknown, number]> = [
      ["75.000", 75000], // ribuan titik (Indonesia)
      ["75,5", 75.5], // desimal koma (Indonesia)
      ["1.234,56", 1234.56], // ribuan + desimal koma
      ["75000.5", 75000.5], // desimal titik standar (input number)
      ["1234", 1234], // bilangan bulat
      [45000, 45000], // angka murni
    ];
    for (const [input, harapan] of kasus) {
      const res = validateProduct({ ...HARGA, selling_price: input });
      expect(res.valid, `input: ${String(input)}`).toBe(true);
      expect(res.data?.selling_price).toBe(harapan);
    }
  });

  it("dibulatkan maksimal 2 angka desimal", () => {
    const res = validateProduct({ ...HARGA, selling_price: 123.456 });
    expect(res.data?.selling_price).toBe(123.46);
    const res2 = validateProduct({ ...HARGA, selling_price: 0.005 });
    expect(res2.data?.selling_price).toBe(0.01);
  });

  it("batas maksimum numeric(14,2): tepat batas sah, melebihi ditolak", () => {
    expect(validateProduct({ ...HARGA, selling_price: NUMERIC_MAX }).valid).toBe(true);
    const lewat = validateProduct({ ...HARGA, selling_price: 1000000000000 });
    expect(lewat.valid).toBe(false);
    expect(lewat.errors).toContain("Harga jual melebihi batas maksimum 999.999.999.999,99.");
  });
});

describe("validateProduct — harga modal (opsional)", () => {
  it("kosong/null → null tanpa error", () => {
    for (const cost of [null, undefined, ""]) {
      const res = validateProduct({ ...HARGA, unit_cost: cost });
      expect(res.valid).toBe(true);
      expect(res.data?.unit_cost).toBeNull();
    }
  });

  it("negatif → error", () => {
    const res = validateProduct({ ...HARGA, unit_cost: -5000 });
    expect(res.valid).toBe(false);
    expect(res.errors).toContain("Harga modal tidak boleh negatif.");
  });

  it("format salah → error", () => {
    const res = validateProduct({ ...HARGA, unit_cost: "abc" });
    expect(res.valid).toBe(false);
    expect(res.errors).toContain("Harga modal wajib angka yang valid.");
  });

  it("dibulatkan 2 desimal & melebihi batas ditolak", () => {
    expect(validateProduct({ ...HARGA, unit_cost: 10.005 }).data?.unit_cost).toBe(10.01);
    const lewat = validateProduct({ ...HARGA, unit_cost: NUMERIC_MAX + 1 });
    expect(lewat.valid).toBe(false);
    expect(lewat.errors).toContain("Harga modal melebihi batas maksimum 999.999.999.999,99.");
  });
});

describe("validateProduct — stok (opsional)", () => {
  it("kosong/null → null tanpa error", () => {
    for (const stock of [null, undefined, ""]) {
      const res = validateProduct({ ...HARGA, stock });
      expect(res.valid).toBe(true);
      expect(res.data?.stock).toBeNull();
    }
  });

  it("negatif → error", () => {
    const res = validateProduct({ ...HARGA, stock: -1 });
    expect(res.valid).toBe(false);
    expect(res.errors).toContain("Stok tidak boleh negatif.");
  });

  it("format salah (termasuk NaN/Infinity) → error", () => {
    for (const stock of ["abc", NaN, Infinity, {}]) {
      const res = validateProduct({ ...HARGA, stock });
      expect(res.valid).toBe(false);
      expect(res.errors).toContain("Stok wajib angka yang valid.");
    }
  });

  it("stok desimal sah (mis. kg) & dibulatkan 2 desimal", () => {
    const res = validateProduct({ ...HARGA, stock: 2.5 });
    expect(res.data?.stock).toBe(2.5);
    expect(validateProduct({ ...HARGA, stock: 3.14159 }).data?.stock).toBe(3.14);
  });

  it("melebihi batas numeric(14,2) ditolak", () => {
    const lewat = validateProduct({ ...HARGA, stock: 1000000000000 });
    expect(lewat.valid).toBe(false);
    expect(lewat.errors).toContain("Stok melebihi batas maksimum 999.999.999.999,99.");
  });
});

describe("validateProduct — satuan (opsional)", () => {
  it("kosong/null → null tanpa error", () => {
    for (const unit of [null, undefined, ""]) {
      const res = validateProduct({ ...HARGA, unit });
      expect(res.valid).toBe(true);
      expect(res.data?.unit).toBeNull();
    }
  });

  it("batas panjang satuan: 40 sah, 41 ditolak", () => {
    expect(validateProduct({ ...HARGA, unit: "u".repeat(PRODUCT_UNIT_MAX) }).valid).toBe(true);
    const lewat = validateProduct({ ...HARGA, unit: "u".repeat(PRODUCT_UNIT_MAX + 1) });
    expect(lewat.valid).toBe(false);
    expect(lewat.errors).toContain(`Satuan produk maksimal ${PRODUCT_UNIT_MAX} karakter.`);
  });

  it("satuan non-teks → error", () => {
    const res = validateProduct({ ...HARGA, unit: 5 });
    expect(res.valid).toBe(false);
    expect(res.errors).toContain("Satuan produk harus berupa teks.");
  });
});

describe("validateProduct — status aktif", () => {
  it("default true; false dan 'false' dipertahankan", () => {
    expect(validateProduct(HARGA).data?.is_active).toBe(true);
    expect(validateProduct({ ...HARGA, is_active: false }).data?.is_active).toBe(false);
    expect(validateProduct({ ...HARGA, is_active: "false" }).data?.is_active).toBe(false);
    expect(validateProduct({ ...HARGA, is_active: "true" }).data?.is_active).toBe(true);
  });

  it("nilai tidak valid → error", () => {
    const res = validateProduct({ ...HARGA, is_active: "ya" });
    expect(res.valid).toBe(false);
    expect(res.errors).toContain("Status aktif produk tidak valid.");
  });
});

describe("validateProduct — input tidak valid", () => {
  it("bukan objek → error 'Data produk tidak valid.'", () => {
    for (const raw of [null, undefined, "teks", 42, true, [1, 2]]) {
      const res = validateProduct(raw);
      expect(res.valid).toBe(false);
      expect(res.errors).toEqual(["Data produk tidak valid."]);
      expect(res.data).toBeNull();
    }
  });

  it("objek kosong → semua error wajib terkumpul", () => {
    const res = validateProduct({});
    expect(res.valid).toBe(false);
    expect(res.errors).toContain("Nama produk wajib diisi.");
    expect(res.errors).toContain("Harga jual wajib diisi.");
    expect(res.data).toBeNull();
  });

  it("beberapa error sekaligus dikumpulkan (bukan berhenti di error pertama)", () => {
    const res = validateProduct({
      name: "",
      selling_price: -5,
      unit_cost: "abc",
      stock: -1,
      is_active: "mungkin",
    });
    expect(res.valid).toBe(false);
    expect(res.errors.length).toBeGreaterThanOrEqual(5);
    expect(res.data).toBeNull();
  });

  it("semua pesan error berbahasa Indonesia", () => {
    const res = validateProduct({});
    for (const pesan of res.errors) {
      expect(pesan).toMatch(/wajib|maksimal|valid|negatif|teks/);
    }
  });
});
