/**
 * ============================================
 * ⚠️ DATA CONTOH (DEMO) — BUKAN DATA BISNIS PENGUSER
 * ============================================
 * Semua angka di file ini FIKTIF dan hanya dipakai selama TAHAP 1,
 * sebelum Supabase terhubung. Tujuannya agar halaman dashboard bisa
 * di-desain dan diuji tampilannya dengan percaya diri.
 *
 * - Dibramkan dengan jelas di UI lewat komponen <DemoBanner />.
 * - File ini akan DIHAPUS di Tahap 2 ketika data asli dari database.
 * - Jangan pernah menampilkan angka dari file ini seolah-olah nyata.
 * ============================================
 */

export const IS_USING_DEMO_DATA = true as const;

export const DEMO_BUSINESS = {
  ownerName: "Rina",
  businessName: "Kedai Kopi Senja",
  category: "Makanan & Minuman",
};

export const DEMO_STATS = {
  /** Total penjualan hari ini */
  todaySales: 485000,
  /** Total penjualan bulan ini */
  monthSales: 12450000,
  /** Jumlah transaksi bulan ini */
  monthTransactions: 143,
  /** Total pengeluaran bulan ini */
  monthExpenses: 7420000,
  /** Estimasi keuntungan (pemasukan − pengeluaran, estimasi karena modal per item belum dicatat) */
  monthProfit: 5030000,
};

/** Tren penjualan 14 hari terakhir (label tanggal pendek) */
export const DEMO_SALES_TREND = [
  { day: "17 Okt", value: 320000 },
  { day: "18 Okt", value: 410000 },
  { day: "19 Okt", value: 386000 },
  { day: "20 Okt", value: 452000 },
  { day: "21 Okt", value: 512000 },
  { day: "22 Okt", value: 476000 },
  { day: "23 Okt", value: 590000 },
  { day: "24 Okt", value: 632000 },
  { day: "25 Okt", value: 548000 },
  { day: "26 Okt", value: 501000 },
  { day: "27 Okt", value: 468000 },
  { day: "28 Okt", value: 536000 },
  { day: "29 Okt", value: 610000 },
  { day: "30 Okt", value: 485000 },
];

export const DEMO_TOP_PRODUCTS = [
  { rank: 1, name: "Kopi Susu Gula Aren", sold: 186, revenue: 2232000 },
  { rank: 2, name: "Roti Bakar Cokelat", sold: 132, revenue: 1188000 },
  { rank: 3, name: "Es Kopi Tanpa Gula", sold: 108, revenue: 1080000 },
  { rank: 4, name: "Matcha Latte", sold: 76, revenue: 836000 },
  { rank: 5, name: "Croissant Butter", sold: 54, revenue: 594000 },
];

export const DEMO_RECENT_TRANSACTIONS = [
  {
    id: "demo-trx-1",
    date: "30 Okt 2026",
    title: "Kopi Susu Gula Aren",
    type: "income" as const,
    method: "qris",
    amount: 135000,
  },
  {
    id: "demo-trx-2",
    date: "30 Okt 2026",
    title: "Beli biji kopi 5 kg",
    type: "expense" as const,
    method: "transfer",
    amount: 620000,
  },
  {
    id: "demo-trx-3",
    date: "30 Okt 2026",
    title: "Roti Bakar Cokelat",
    type: "income" as const,
    method: "cash",
    amount: 45000,
  },
  {
    id: "demo-trx-4",
    date: "29 Okt 2026",
    title: "Matcha Latte",
    type: "income" as const,
    method: "qris",
    amount: 55000,
  },
  {
    id: "demo-trx-5",
    date: "29 Okt 2026",
    title: "Belanja galon & es batu",
    type: "expense" as const,
    method: "cash",
    amount: 185000,
  },
  {
    id: "demo-trx-6",
    date: "29 Okt 2026",
    title: "Croissant Butter",
    type: "income" as const,
    method: "transfer",
    amount: 99000,
  },
];

/** Contoh ringkasan AI Insight (teks contoh, bukan hasil analisis nyata) */
export const DEMO_AI_INSIGHT = {
  headline: "Penjualan 14 hari terakhir cenderung naik.",
  bullets: [
    "Rata-rata penjualan harian naik dari Rp 386.000 menjadi Rp 536.000 sejak 20 Okt, terutama didorong oleh penjualan akhir pekan.",
    "Kopi Susu Gula Aren adalah produk paling laris dengan 186 cup terjual — jauh di atas produk kedua.",
    "Pengeluaran bulan ini terbesar ada di pembelian bahan baku (biji kopi). Pertimbangkan mencatat modal per produk agar estimasi keuntungan akurat.",
  ],
};
