import { QUANTITY_MAX } from "./validate";
import type { Product } from "@/types";

/**
 * KERANJANG POS — fungsi murni (Tahap P5.3).
 *
 * Keranjang hanya UI: harga/nama/total yang ditampilkan dihitung dari
 * snapshot produk yang siap di checkout, tetapi sumber kebenaran transaksi
 * tetap RPC create_sale (database adalah sumber kebenaran harga/nama/total).
 * Tidak ada akses database di modul ini.
 *
 * Semua fungsi immut: mengembalikan array baru, tidak mengubah yang lama.
 * quantity dinormalisasi maksimal 2 angka desimal dan berbatas atas
 * numeric(12,2); nilai ≤ 0 berarti baris dihapus dari keranjang.
 *
 * CATATAN STOK: helper isStockDepleted() hanya untuk menonaktifkan
 * tombol "Tambah" di UI. Pengaman kebenaran tetap RPC
 * create_sale (database menolak stok tidak cukup) — sini tidak pernah
 * mengubah aturan stok backend.
 */

export interface CartLine {
  product: Product;
  quantity: number;
}

export interface SaleSummary {
  totalQuantity: number;
  total: number;
}

const MIN_QTY = 0.01;

/** Bulatkan maksimal 2 angka desimal (numeric(14,2)) */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Normalisasi quantity: bulatkan 2 desimal & batas atas numeric(12,2) */
function clampQuantity(quantity: number): number {
  return Math.min(QUANTITY_MAX, round2(quantity));
}

/**
 * Tambahkan produk ke keranjang.
 * - Hanya produk AKTIF yang bisa ditambahkan (produk nonaktif diabaikan).
 * - Produk yang sudah ada di keranjang → quantity bertambah.
 */
/**
 * Apakah stok produk telah habis? Hanya untuk produk yang DILACAK
 * (`stock !== null`); produk tanpa pelacakan stok (NULL) selalu
 * bisa ditambahkan ke keranjang. Pemisahan UI ini, pengaman
 * kenyataan tetap RPC create_sale.
 */
export function isStockDepleted(stock: number | null): boolean {
  return stock !== null && stock <= 0;
}

export function addToCart(
  lines: CartLine[],
  product: Product,
  quantity = 1
): CartLine[] {
  if (!product.is_active) {
    return [...lines];
  }

  const qty = clampQuantity(quantity);
  if (!(qty >= MIN_QTY)) {
    return [...lines];
  }

  const existing = lines.find((line) => line.product.id === product.id);
  if (existing) {
    return changeQuantity(lines, product.id, existing.quantity + qty);
  }

  return [...lines, { product, quantity: qty }];
}

/**
 * Ubah quantity satu baris.
 * - Nilai ≤ 0 (termasuk hasil pembulatan sangat kecil) = hapus baris.
 * - Nilai > batas numeric(12,2) → dibatasi ke batas.
 */
export function changeQuantity(
  lines: CartLine[],
  productId: string,
  next: number
): CartLine[] {
  const qty = clampQuantity(next);
  if (!(qty >= MIN_QTY)) {
    return removeFromCart(lines, productId);
  }
  return lines.map((line) =>
    line.product.id === productId ? { product: line.product, quantity: qty } : line
  );
}

/** Hapus satu baris dari keranjang */
export function removeFromCart(
  lines: CartLine[],
  productId: string
): CartLine[] {
  return lines.filter((line) => line.product.id !== productId);
}

/**
 * Ringkasan keranjang (ditampilkan di UI):
 * - total  = Σ round2(quantity × selling_price per baris) — cara hitung
 *   identik dengan RPC create_sale (subtotal per item dibulatkan 2
 *   desimal lalu dijumlah).
 * - totalQuantity = Σ quantity seluruh baris.
 */
export function sumSale(lines: CartLine[]): SaleSummary {
  let totalQuantity = 0;
  let subtotal = 0;
  for (const line of lines) {
    const qty = line.quantity;
    totalQuantity = clampQuantity(totalQuantity + qty);
    subtotal = clampQuantity(subtotal + round2(qty * line.product.selling_price));
  }
  return { totalQuantity, total: subtotal };
}

/**
 * UUID request_id BARU untuk checkout berikutnya — ditaruh setelah
 * checkout SUKSES: retry checkout yang gagal harus memakai request_id lama.
 */
export function nextRequestId(prevRequestId?: string): string {
  const requestId = crypto.randomUUID();
  // Hampir mustahil bentrok — tetap jaga kontrak "berbeda dari sebelumnya"
  if (prevRequestId && requestId === prevRequestId) {
    return nextRequestId(prevRequestId);
  }
  return requestId;
}

/**
 * Efek checkout SUKSES: keranjang dikosongkan (hanya saat sukses —
 * checkout yang gagal mengembalikan error dan keranjang tetap utuh)
 * dan request_id BARU disiapkan untuk transaksi berikutnya.
 * Dipanggil PosClient hanya pada jalur sukses RPC.
 */
export interface SaleOutcome {
  lines: CartLine[];
  requestId: string;
}

export function finalizeSale(
  lines: CartLine[],
  prevRequestId: string
): SaleOutcome {
  void lines;
  return { lines: [], requestId: nextRequestId(prevRequestId) };
}
