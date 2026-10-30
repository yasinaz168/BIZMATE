import { Settings } from "lucide-react";
import { ComingSoon } from "@/components/app/coming-soon";

export const metadata = { title: "Pengaturan" };

export default function PengaturanPage() {
  return (
    <ComingSoon
      title="Pengaturan"
      phase="Tahap 2"
      icon={Settings}
      description="Kelola data bisnis dan preferensi akunmu. Aktif bersamaan dengan onboarding."
      planned={[
        "Profil bisnis: nama, kategori, deskripsi, produk/jasa, telepon",
        "Preferensi: bahasa Indonesia, mata uang IDR, zona waktu Asia/Jakarta (default)",
        "Penghapusan data demo tampil di dashboard saat ini",
        "Keamanan akun & manajemen sesi login",
      ]}
    />
  );
}
