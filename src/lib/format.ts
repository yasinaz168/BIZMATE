/**
 * Helper format untuk Bahasa Indonesia dan Rupiah (IDR).
 * Timezone default aplikasi: Asia/Jakarta.
 */

/** Format angka menjadi Rupiah, contoh: Rp 485.000 */
export function formatIDR(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}

/** Format angka ringkas untuk chart/statistik, contoh: 1,2 jt */
export function formatIDRCompact(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(amount);
}

const MONTHS_ID = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];

const MONTHS_FULL_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

const DAYS_ID = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

/** Format tanggal panjang: "28 Oktober 2026" */
export function formatDateLong(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const day = d.getDate();
  const month = MONTHS_FULL_ID[d.getMonth()];
  return `${day} ${month} ${d.getFullYear()}`;
}

/** Format tanggal pendek: "28 Okt 2026" */
export function formatDateShort(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const day = d.getDate();
  const month = MONTHS_ID[d.getMonth()];
  return `${day} ${month} ${d.getFullYear()}`;
}

/** Nama hari dalam Bahasa Indonesia, contoh: "Jumat" */
export function getDayName(date: Date): string {
  return DAYS_ID[date.getDay()];
}

/** Label metode pembayaran untuk UI */
export function getPaymentLabel(method: string): string {
  const labels: Record<string, string> = {
    cash: "Tunai",
    transfer: "Transfer",
    qris: "QRIS",
    ewallet: "E-Wallet",
  };
  return labels[method] ?? method;
}

/** Label jenis transaksi */
export function getTypeLabel(type: string): string {
  return type === "income" ? "Pemasukan" : "Pengeluaran";
}
