import { Package } from "lucide-react";
import { ComingSoon } from "@/components/app/coming-soon";

export const metadata = { title: "Produk" };

export default function ProdukPage() {
  return (
    <ComingSoon
      title="Produk"
      phase="Tahap 3"
      icon={Package}
      description="Katalog produk atau jasa yang kamu jual lengkap dengan harga jual dan modal per unit."
      planned={[
        "Tambah, edit, hapus, dan cari produk",
        "Kategori, harga jual, modal per unit (opsional), stok, satuan",
        "Status produk aktif / tidak aktif",
        "Modal per unit dipakai untuk estimasi keuntungan yang akurat",
        "MVP: tanpa inventori otomatis yang kompleks",
      ]}
    />
  );
}
