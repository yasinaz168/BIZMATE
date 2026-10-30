import { CirclePlus } from "lucide-react";
import { ComingSoon } from "@/components/app/coming-soon";

export const metadata = { title: "Tambah Transaksi" };

export default function TransaksiBaruPage() {
  return (
    <ComingSoon
      title="Tambah Transaksi (Manual)"
      phase="Tahap 3"
      icon={CirclePlus}
      description="Formulir pencatatan manual untuk transaksi yang tidak lewat AI — misalnya pengeluaran bahan baku atau penjualan offline."
      planned={[
        "Jenis transaksi: pemasukan atau pengeluaran",
        "Field: nama produk/kategori, jumlah, harga satuan, tanggal, metode bayar, catatan",
        "Total dihitung otomatis dan divalidasi di backend",
        "Validasi ketat: jumlah > 0, harga tidak negatif, tanggal valid",
        "Kesalahan input ditampilkan jelas per field",
      ]}
    />
  );
}
