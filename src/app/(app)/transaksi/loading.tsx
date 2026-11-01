import { Skeleton } from "@/components/ui/skeleton";

/** Loading state halaman Transaksi (P5.4.2) — pola sama dengan Kasir/Produk. */
export default function TransaksiLoading() {
  return (
    <div className="space-y-6">
      <section>
        <Skeleton className="h-7 w-28" />
        <Skeleton className="mt-2 h-4 w-80 max-w-full" />
      </section>

      <section aria-label="Loading ringkasan" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </section>

      <section aria-label="Loading filter">
        <Skeleton className="h-40 rounded-2xl" />
      </section>

      <section aria-label="Loading daftar transaksi" className="space-y-3">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-12 rounded-lg" />
        ))}
      </section>
    </div>
  );
}
