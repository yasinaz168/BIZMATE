import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Pengujian fix kartu produk kasir (stok habis):
 * - Produk dengan stock !== null && stock <= 0 → tombol Tambah disabled
 *   dengan label "Stok habis".
 * - stock === null (tidak dilacak) → tetap bisa ditambahkan.
 * - Pengaman kebenaran tidak diubah: RPC create_sale, validasi server,
 *   idempotency tetap sepenuhnya berjalan (tidak ada perubahan backend).
 */

const source = readFileSync(
  fileURLToPath(new URL("./pos-client.tsx", import.meta.url)),
  "utf8"
);

const cartLib = readFileSync(
  fileURLToPath(new URL("../../../lib/pos/cart.ts", import.meta.url)),
  "utf8"
);

describe("pos-client — tombol Tambah stok habis", () => {
  it("memakai helper isStockDepleted dari lib/pos/cart", () => {
    expect(source).toContain("isStockDepleted,");
    expect(cartLib).toContain("export function isStockDepleted");
  });

  it("tombol Tambah disabled saat stok habis + label 'Stok habis'", () => {
    expect(source).toContain("disabled={pending || stockOut}");
    expect(source).toContain(`{stockOut ? "Stok habis" : "Tambah"}`);
    // label aksesibilitas ikut berubah agar pengguna paham alasannya
    expect(source).toContain("${item.name} stok habis");
  });

  it("tombol lama (selalu aktif selama pending) tidak ada lagi", () => {
    expect(source).not.toContain(
      `disabled={pending}\n                    onClick={() => handleAddToCart(item)}`
    );
  });

  it("backend/aturan stok TIDAK diubah (RPC create_sale tetap pengaman utama)", () => {
    // lib/pos/cart tidak boleh menghapus komentar pengaman yang menyatakan
    // sumber kebenaran tetap RPC create_sale
    expect(cartLib).toContain("RPC create_sale (database adalah sumber kebenaran");
  });
});
