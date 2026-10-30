import { ReceiptText } from "lucide-react";
import { ComingSoon } from "@/components/app/coming-soon";

export const metadata = { title: "Transaksi" };

export default function TransaksiPage() {
  return (
    <ComingSoon
      title="Transaksi"
      phase="Tahap 3"
      icon={ReceiptText}
      description="Riwayat lengkap pemasukan dan pengeluaran bisnismu. Halaman aktif bersamaan dengan manajemen produk."
      planned={[
        "Daftar transaksi dengan pencarian dan filter (tanggal, jenis, metode bayar)",
        "Tambah, edit, dan hapus transaksi (hapus selalu dengan konfirmasi)",
        "Detail transaksi dan nomor referensi",
        "Pagination saat data banyak",
        "Total dihitung di server, bukan dari angka yang dikirim browser",
      ]}
    />
  );
}
