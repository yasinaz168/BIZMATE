import { formatIDR } from "@/lib/format";
import type { TopProduct } from "@/types";
import { cn } from "@/lib/utils";

/** Daftar produk paling laris. Semua angka harus dari data sungguhan/kontoh yang jelas. */
export function TopProducts({ products }: { products: TopProduct[] }) {
  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line py-10 text-center">
        <p className="text-sm font-medium text-foreground">Belum ada produk terjual</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Produk terlaris akan muncul setelah ada transaksi pemasukan.
        </p>
      </div>
    );
  }

  return (
    <ol className="space-y-2.5">
      {products.map((product) => (
        <li
          key={product.rank}
          className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-muted/70"
        >
          <span
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold",
              product.rank === 1
                ? "bg-primary text-white"
                : "bg-muted text-muted-foreground"
            )}
          >
            {product.rank}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-foreground">{product.name}</span>
            <span className="block text-xs text-muted-foreground">{product.sold} terjual</span>
          </span>
          <span className="shrink-0 text-sm font-semibold text-foreground">
            {formatIDR(product.revenue)}
          </span>
        </li>
      ))}
    </ol>
  );
}
