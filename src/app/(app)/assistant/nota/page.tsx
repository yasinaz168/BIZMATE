import { ScanLine } from "lucide-react";
import { ComingSoon } from "@/components/app/coming-soon";

export const metadata = { title: "Upload Foto Nota" };

export default function AssistantNotaPage() {
  return (
    <ComingSoon
      title="AI Receipt Scanner"
      phase="Tahap 5"
      icon={ScanLine}
      description="Upload foto nota belanja atau kuitansi, AI membacanya dan mengisi formulir transaksi. Kamu selalu bisa mengoreksi sebelum menyimpan."
      tone="dark"
      planned={[
        "Validasi file: format (JPG/PNG) dan ukuran maksimum",
        "Foto diproses OCR, lalu AI merapikan hasil bacaan",
        "Diekstrak: tanggal, nama produk, jumlah, harga, total, nama toko",
        "Data yang tidak terbaca ditampilkan kosong — AI tidak menebak",
        "Simpan hanya setelah konfirmasi pengguna",
        "Jika layanan OCR belum diatur, aplikasi berjalan di MOCK MODE dengan label jelas",
      ]}
    />
  );
}
