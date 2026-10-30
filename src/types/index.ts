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
