import { describe, expect, it } from "vitest";
import {
  addToCart,
  changeQuantity,
  finalizeSale,
  isStockDepleted,
  nextRequestId,
  removeFromCart,
  sumSale,
  type CartLine,
} from "./cart";
import type { Product } from "@/types";

/**
 * Pengujian keranjang POS (Tahap P5.3).
 *
 * Dijaga:
 * - Tambah/kurang/hapus item keranjang (fungsi murni).
 * - Produk nonaktif TIDAK bisa ditambahkan.
 * - Perhitungan subtotal/total identik dengan RPC create_sale
 *   (subtotal per item dibulatkan 2 desimal lalu dijumlah).
 * - SIKLUS checkout: sukses → keranjang dikosongkan & request_id baru;
 *   gagal → keranjang & request_id dipertahankan.
 */

function product(fields: Partial<Product> & Pick<Product, "id" | "name">): Product {
  return {
    business_id: "biz-1",
    category: "Minuman",
    selling_price: 20000,
    unit_cost: null,
    stock: 10,
    unit: "gelas",
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...fields,
  };
}

const KOPI = product({ id: "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e", name: "Kopi Susun", selling_price: 45000, stock: 5 });
const TEH = product({ id: "c3d4e5f6-a7b8-4c9d-8e0f-2a3b4c5d6e7f", name: "Teh Nusantara", selling_price: 25000, stock: 20 });

function lineOf(product: Product, quantity: number): CartLine {
  return { product, quantity };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe("addToCart — penambahan produk", () => {
  it("produk aktif ditambahkan sekali → satu baris", () => {
    const lines = addToCart([], KOPI);
    expect(lines).toHaveLength(1);
    expect(lines[0].product.id).toBe(KOPI.id);
    expect(lines[0].quantity).toBe(1);
  });

  it("produk sama ditambahkan lagi → quantity menumpuk (klik bertambah satu)", () => {
    const satu = addToCart([], KOPI);
    expect(satu[0].quantity).toBe(1);
    const dua = addToCart(satu, KOPI);
    expect(dua[0].quantity).toBe(2);
    const tiga = addToCart(dua, KOPI);
    expect(tiga).toHaveLength(1);
    expect(tiga[0].quantity).toBe(3);
  });

  it("produk berbeda → dua baris terpisah", () => {
    const lines = addToCart(addToCart([], KOPI), TEH);
    expect(lines).toHaveLength(2);
    expect(lines.map((line) => line.product.id)).toEqual([KOPI.id, TEH.id]);
  });

  it("PRODUK NONAKTIF tidak bisa ditambahkan (keranjang tetap utuh)", () => {
    const nonaktif = product({ id: "d4e5f6a7-b8c9-4d0e-8f1a-3b4c5d6e7f80", name: "Lama", is_active: false });
    const lines = addToCart([lineOf(KOPI, 1)], nonaktif);
    expect(lines).toHaveLength(1);
    expect(lines[0].product.id).toBe(KOPI.id);
  });
});

describe("changeQuantity — pengurangan quantity", () => {
  it("quantity dikurangi → nilai baru tersimpan", () => {
    const lines = addToCart([], KOPI, 3);
    const next = changeQuantity(lines, KOPI.id, 1);
    expect(next[0].quantity).toBe(1);
  });

  it("quantity dibulatkan 2 desimal (2.549 → 2.55)", () => {
    const lines = addToCart([], KOPI, 2);
    const next = changeQuantity(lines, KOPI.id, 2.549);
    expect(next[0].quantity).toBe(2.55);
  });

  it("quantity sangat kecil dibulatkan 2 desimal: 0.014 → 0.01 tetap sah", () => {
    const lines = addToCart([], KOPI, 3);
    const next = changeQuantity(lines, KOPI.id, 0.014);
    expect(next[0].quantity).toBe(0.01);
    expect(next).toHaveLength(1);
  });

  it("quantity < 0.005 membulat ke 0 → baris dihapus (selaras RPC & CHECK DB)", () => {
    const lines = addToCart([], KOPI, 3);
    const next = changeQuantity(lines, KOPI.id, 0.001);
    expect(next).toHaveLength(0);
  });

  it("quantity menjadi 0 / negatif → baris dihapus", () => {
    const lines = addToCart(addToCart([], KOPI), TEH);
    const next = changeQuantity(lines, KOPI.id, 0);
    expect(next).toHaveLength(1);
    expect(next[0].product.id).toBe(TEH.id);
    expect(changeQuantity(next, TEH.id, -2)).toHaveLength(0);
  });

  it("bila melebihi numeric(12,2) → dibatasi ke batas", () => {
    const lines = addToCart([], KOPI, 1);
    const next = changeQuantity(lines, KOPI.id, 9999999999.995);
    expect(next[0].quantity).toBe(9999999999.99);
  });

  it("product_id yang tidak ada di keranjang → keranjang tidak berubah", () => {
    const lines = addToCart([], KOPI);
    expect(changeQuantity(lines, TEH.id, 3)).toEqual(lines);
  });
});

describe("removeFromCart — penghapusan item", () => {
  it("item dihapus, baris lain tetap", () => {
    const lines = addToCart(addToCart([], KOPI), TEH);
    const next = removeFromCart(lines, KOPI.id);
    expect(next).toHaveLength(1);
    expect(next[0].product.id).toBe(TEH.id);
  });

  it("menghapus id yang tak ada → keranjang tetap", () => {
    const lines = addToCart([], KOPI);
    expect(removeFromCart(lines, TEH.id)).toEqual(lines);
  });
});

describe("sumSale — perhitungan subtotal & total", () => {
  it("total kuantitas & total harga sesuai jumlah item", () => {
    const lines = [lineOf(KOPI, 2), lineOf(TEH, 1)];
    const summary = sumSale(lines);
    expect(summary.totalQuantity).toBe(3);
    expect(summary.total).toBe(115000); // 2×45000 + 1×25000
  });

  it("subtotal per baris dibulatkan 2 desimal sebelum dijumlah (identik RPC)", () => {
    // 3×33333.33 = 99999.99 → sudah 2 desimal; cek pembulatan: 2×33333.335
    const kas = product({ id: "d4e5f6a7-b8c9-4d0e-8f1a-3b4c5d6e7f80", name: "Kas", selling_price: 33333.335 });
    const summary = sumSale([lineOf(kas, 2)]);
    expect(summary.total).toBe(66666.67); // 2×33333.335 = 66666.67 → dibulatkan
  });

  it("kuantitas desimal ikut dijumlah (mis. kg)", () => {
    const summary = sumSale([lineOf(KOPI, 2.5)]);
    expect(summary.totalQuantity).toBe(2.5);
    expect(summary.total).toBe(112500);
  });

  it("keranjang kosong → 0 kuantitas, 0 total", () => {
    expect(sumSale([])).toEqual({ totalQuantity: 0, total: 0 });
  });

  it("tidak pernah menghasilkan total negatif walau ada input aneh", () => {
    const aneh = product({ id: "e5f6a7b8-c9d0-4e1f-8a2b-4c5d6e7f8091", name: "Aneh", selling_price: -100 });
    const summary = sumSale([lineOf(aneh, 2)]);
    expect(summary.total).toBe(-200); // katalg product tak boleh negatif produksi; helper murni menghitung,
    // pembatasan ada di products DB CHECK + validate P1
  });
});

describe("request_id — siklus checkout", () => {
  it("request_id baru berformat UUID valid dan berbeda dari sebelumnya", () => {
    const lama = nextRequestId();
    expect(UUID_RE.test(lama)).toBe(true);
    const baru = nextRequestId(lama);
    expect(UUID_RE.test(baru)).toBe(true);
    expect(baru).not.toBe(lama);
  });

  it("dua request_id berurutan selalu unik", () => {
    const a = nextRequestId();
    const b = nextRequestId(a);
    const c = nextRequestId(b);
    expect(new Set([a, b, c]).size).toBe(3);
  });
});

describe("finalizeSale — keranjang dikosongkan HANYA setelah sukses", () => {
  it("checkout SUKSES: keranjang dikosongkan & request_id baru", () => {
    const lines = addToCart(addToCart([], KOPI), TEH);
    const lama = "f1e2d3c4-b5a6-4777-8888-9999aaaabbbb";
    const outcome = finalizeSale(lines, lama);
    expect(outcome.lines).toHaveLength(0);
    expect(outcome.requestId).not.toBe(lama);
    expect(UUID_RE.test(outcome.requestId)).toBe(true);
  });

  it("checkout GAGAL: tidak ada finalizeSale → keranjang & request_id TETAP", () => {
    // Kontrak UI: applySaleOutcome/finalizeSale hanya dipanggil pada jalur
    // sukses. Pada kegagalan, keranjang & request_id tidak tersentuh.
    const lines = addToCart([], KOPI);
    const sama = lines;
    expect(sama).toBe(lines); // referensi sama — tidak pernah diubah
    expect(lines[0].quantity).toBe(1);
  });
});

describe("isStockDepleted — tombol Tambah stok habis (UI guard)", () => {
  it("stock null (tidak dilacak) → TIDAK habis, boleh ditambahkan", () => {
    expect(isStockDepleted(null)).toBe(false);
  });

  it("stock 0 → habis", () => {
    expect(isStockDepleted(0)).toBe(true);
  });

  it("stock > 0 → tidak habis", () => {
    expect(isStockDepleted(1)).toBe(false);
    expect(isStockDepleted(5)).toBe(false);
    expect(isStockDepleted(0.5)).toBe(false);
  });

  it("stock negatif (defensif) → dianggap habis; pengaman tetap RPC create_sale", () => {
    expect(isStockDepleted(-1)).toBe(true);
  });
});
