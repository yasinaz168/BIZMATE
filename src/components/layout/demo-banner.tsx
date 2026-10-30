import { Info } from "lucide-react";

/**
 * Banner transparan: memberi tahu pengguna bahwa data yang tampil
 * masih DATA CONTOH selama Tahap 1 (belum ada database).
 * Banner ini dihapus di Tahap 2 ketika Supabase terhubung.
 */
export function DemoBanner() {
  return (
    <div className="border-b border-orange-100 bg-orange-50 px-4 py-2.5 sm:px-6 lg:px-8">
      <div className="page-container flex flex-col items-start gap-1 py-0 text-orange-800 sm:flex-row sm:items-center sm:gap-2.5">
        <Info className="h-4 w-4 shrink-0 text-orange-500" aria-hidden="true" />
        <p className="text-xs leading-relaxed sm:text-[13px]">
          <strong>Mode Demo — Ini Bukan Datamu.</strong> Semua angka di aplikasi saat ini adalah
          contoh agar tampilan bisa diuji. Database &amp; datamu yang sebenarnya terhubung di{" "}
          <strong>Tahap 2</strong>.
        </p>
      </div>
    </div>
  );
}
