import { BarChart3 } from "lucide-react";
import { ComingSoon } from "@/components/app/coming-soon";

export const metadata = { title: "Laporan" };

export default function LaporanPage() {
  return (
    <ComingSoon
      title="Laporan"
      phase="Tahap 6"
      icon={BarChart3}
      description="Laporan bisnis yang jujur dan gampang dipahami — dihitung dari transaksi yang benar-benar tersimpan di database."
      tone="dark"
      planned={[
        "Laporan harian, mingguan, dan bulanan",
        "Filter rentang tanggal yang fleksibel",
        "Grafik penjualan + total pemasukan dan pengeluaran",
        "Estimasi keuntungan dikelompokkan jelas dari omzet",
        "Produk terlaris dan riwayat transaksi dalam rentang terpilih",
        "Export CSV",
      ]}
    />
  );
}
