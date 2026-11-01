import { Skeleton } from "@/components/ui/skeleton";

/** Loading state halaman Detail Transaksi (P5.4.3) — pola sama P5.4.2. */
export default function TransaksiDetailLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-4 w-32" />

      <section aria-label="Loading detail transaksi">
        <Skeleton className="h-56 rounded-2xl" />
      </section>

      <section aria-label="Loading rincian item" className="space-y-3">
        <Skeleton className="h-28 rounded-2xl" />
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-12 rounded-lg" />
        ))}
      </section>
    </div>
  );
}
