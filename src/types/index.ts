/**
 * Tipe data bersama yang dipakai di seluruh aplikasi.
 * Di Tahap 2+, tipe ini akan disamakan dengan skema tabel Supabase.
 */

export type TransactionType = "income" | "expense";

export type PaymentMethod = "cash" | "transfer" | "qris" | "ewallet";

export interface TransactionSummary {
  id: string;
  /** Tanggal dengan format tampilan, contoh: "30 Okt 2026" */
  date: string;
  /** Nama produk (pemasukan) atau kategori (pengeluaran) */
  title: string;
  type: TransactionType;
  method: PaymentMethod | string;
  amount: number;
}

export interface SalesTrendPoint {
  day: string;
  value: number;
}

export interface TopProduct {
  rank: number;
  name: string;
  sold: number;
  revenue: number;
}

/** Item navigasi utama aplikasi (sidebar & mobile drawer) */
export interface NavItem {
  label: string;
  href: string;
  icon: string;
}

/**
 * Produk/jasa pada katalog bisnis — cocok dengan tabel `products`.
 * Pemetaan kolom 1:1 dengan skema Supabase.
 */
export interface Product {
  id: string;
  business_id: string;
  name: string;
  /** kategori produk (free text) — bukan kategori bisnis */
  category: string | null;
  /** harga jual per satuan, rupiah */
  selling_price: number;
  /** modal per satuan — null bila tidak dicatat */
  unit_cost: number | null;
  /** jumlah stok — null bila tidak dilacak */
  stock: number | null;
  /** satuan, mis. "pcs", "kg" */
  unit: string | null;
  /** false = produk nonaktif (tidak ditawarkan) */
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Input untuk membuat/mengubah produk — subset kolom tabel `products`
 * yang diisi pengguna (tanpa id/business_id/created_at/updated_at).
 * Nilai sudah dinormalisasi oleh src/lib/products/validate.ts.
 */
export interface ProductInput {
  name: string;
  category: string | null;
  selling_price: number;
  unit_cost: number | null;
  stock: number | null;
  unit: string | null;
  is_active: boolean;
}

/**
 * Satu produk dalam keranjang POS.
 *
 * Sengaja TANPA harga/nama/subtotal: harga & nama produk diambil
 * server-side dari tabel `products` oleh RPC create_sale (database
 * adalah sumber kebenaran) — input browser tidak dipercaya.
 */
export interface CartItem {
  product_id: string;
  quantity: number;
}

/**
 * Input checkout POS — payload yang dipakai memanggil RPC
 * public.create_sale (migration 00005).
 */
export interface CheckoutInput {
  /** UUID unik per percobaan checkout — retry HARUS memakai UUID yang sama */
  request_id: string;
  payment_method: PaymentMethod;
  items: CartItem[];
  notes: string | null;
}

/**
 * Hasil RPC public.create_sale (migration 00005_pos_setup.sql) —
 * bentuk jsonb_build_object persis dari database:
 * { transaction_id, total, item_count, total_quantity, idempotent_replay }
 */
export interface CreateSaleResult {
  transaction_id: string;
  total: number;
  /** jumlah baris item tersimpan (setelah agregasi product_id) */
  item_count: number;
  /** jumlah seluruh unit terjual */
  total_quantity: number;
  /** true = replay: transaksi sebelumnya dikembalikan, tidak ada yang dibuat ulang */
  idempotent_replay: boolean;
}
