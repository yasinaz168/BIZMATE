import { Skeleton } from "@/components/ui/skeleton";

/** Loading state halaman Kasir — hanya dijalankan pada tahap P5.3 */
export default function KasirLoading() {
  return (
    <div className="space-y-6">
      <section>
        <Skeleton className="h-7 w-24" />
        <Skeleton className="mt-2 h-4 w-80 max-w-full" />
      </section>

      <section aria-label="Loading kasir" className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Katalog */}
        <div className="space-y-3 lg:col-span-3">
          <Skeleton className="h-11 rounded-lg" />
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-[72px] rounded-2xl" />
          ))}
        </div>
        {/* Keranjang */}
        <div className="space-y-3 rounded-2xl border border-line bg-surface p-5 lg:col-span-2">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-14 rounded-xl" />
          <Skeleton className="h-14 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-5 w-44" />
          <Skeleton className="h-11 w-full rounded-lg" />
        </div>
      </section>
    </div>
  );
}
