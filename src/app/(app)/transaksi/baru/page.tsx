import { CirclePlus } from "lucide-react";
import { ManualTransactionForm } from "./manual-form";

export const metadata = { title: "Tambah Transaksi" };

/**
 * HALAMAN TRANSAKSI MANUAL (Tahap P5.4.4).
 *
 * Server component tipis: autentikasi & kepemilikan divisialisasi penuh
 * di server action (createManualTransactionAction) saat simpan — selaras
 * layout (app) yang sudah menjaga halaman ini.
 * - Form client (manual-form.tsx): pratinjau total + loading/error state.
 * - Sukses → diarahkan ke detail transaksi yang baru dibuat.
 */
export default function TransaksiBaruPage() {
  return (
    <div className="space-y-6">
      <section>
        <h2 className="flex items-center gap-2 text-xl font-bold tracking-tight sm:text-2xl">
          <CirclePlus className="h-6 w-6 text-primary" aria-hidden="true" />
          Buat Transaksi
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Catat pemasukan atau pengeluaran yang tidak lewat Kasir maupun AI —
          total dihitung otomatis dan divalidasi di server.
        </p>
      </section>

      <ManualTransactionForm />
    </div>
  );
}
