import { Skeleton } from "@/components/ui/skeleton";

/** Loading state halaman Produk — skeleton ringan (Tahap P3) */
export default function ProdukLoading() {
  return (
    <div className="space-y-6">
      <section>
        <Skeleton className="h-7 w-32" />
        <Skeleton className="mt-2 h-4 w-72 max-w-full" />
      </section>

      <section aria-label="Ringkasan produk" className="grid grid-cols-3 gap-3 sm:gap-4">
        <Skeleton className="h-[92px] rounded-2xl" />
        <Skeleton className="h-[92px] rounded-2xl" />
        <Skeleton className="h-[92px] rounded-2xl" />
      </section>

      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <Skeleton className="h-11 flex-1 rounded-lg" />
          <Skeleton className="h-11 w-full rounded-lg sm:w-40" />
        </div>
        <div className="overflow-hidden rounded-2xl border border-line bg-surface p-4 shadow-card">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="flex items-center gap-4 py-3">
              <Skeleton className="h-4 flex-[2] rounded" />
              <Skeleton className="h-4 flex-1 rounded" />
              <Skeleton className="h-4 flex-1 rounded" />
              <Skeleton className="h-4 w-16 rounded" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
