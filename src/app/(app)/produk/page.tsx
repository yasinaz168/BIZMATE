import { redirect } from "next/navigation";
import { CircleAlert, Package, PauseCircle, CircleCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { logDbError } from "@/lib/server-log";
import { StatCard } from "@/components/dashboard/stat-card";
import type { Product } from "@/types";
import { ProductCatalog } from "./product-catalog";

export const metadata = { title: "Produk" };

/**
 * HALAMAN KATALOG PRODUK (Tahap P3).
 *
 * Server component:
 * - Mengambil data produk milik bisnis pengguna yang terautentikasi.
 * - business_id berasal dari lookup server — TIDAK PERNAH dari browser.
 * - Meringkas jumlah produk (total, aktif, nonaktif).
 * - Interaksi (cari/tambah/edit/toggle) ditangani ProductCatalog (client).
 */

/** Normalisasi defensif baris Supabase → Product */
function toProduct(row: Record<string, unknown>): Product {
  const num = (value: unknown): number =>
    typeof value === "number" ? value : Number(value ?? 0) || 0;
  const numOrNull = (value: unknown): number | null =>
    value === null || value === undefined || value === "" ? null : num(value);
  return {
    id: String(row.id ?? ""),
    business_id: String(row.business_id ?? ""),
    name: String(row.name ?? ""),
    category: typeof row.category === "string" ? row.category : null,
    selling_price: num(row.selling_price),
    unit_cost: numOrNull(row.unit_cost),
    stock: numOrNull(row.stock),
    unit: typeof row.unit === "string" ? row.unit : null,
    is_active: Boolean(row.is_active),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

export default async function ProdukPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  // business_id = hasil lookup server (pemilik user ini), BUKAN dari browser
  const { data: business } = await supabase
    .from("businesses")
    .select("id")
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!business) {
    redirect("/onboarding");
  }

  const { data: rows, error } = await supabase
    .from("products")
    .select(
      "id, business_id, name, category, selling_price, unit_cost, stock, unit, is_active, created_at, updated_at"
    )
    .eq("business_id", business.id)
    .order("name", { ascending: true });

  if (error) {
    // Detail database dicatat aman di server — tidak ditampilkan ke pengguna
    logDbError({ route: "produk/page", table: "products", op: "select" }, error);
    return (
      <div className="space-y-6">
        <section>
          <h2 className="text-xl font-bold tracking-tight sm:text-2xl">Produk</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Kelola katalog produk atau jasa yang kamu jual.
          </p>
        </section>
        <section
          role="alert"
          className="flex items-start gap-2.5 rounded-2xl border border-expense/20 bg-expense/5 px-5 py-4 text-sm text-expense"
        >
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Gagal memuat data produk. Muat ulang halaman, lalu coba lagi.</span>
        </section>
      </div>
    );
  }

  const products = (rows ?? []).map((row) => toProduct(row as Record<string, unknown>));
  const total = products.length;
  const active = products.filter((p) => p.is_active).length;
  const inactive = total - active;

  return (
    <div className="space-y-6">
      {/* Header */}
      <section>
        <h2 className="text-xl font-bold tracking-tight sm:text-2xl">Produk</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Kelola katalog produk atau jasa yang kamu jual — harga jual, modal, dan stok.
        </p>
      </section>

      {/* Ringkasan */}
      <section aria-label="Ringkasan produk" className="grid grid-cols-3 gap-3 sm:gap-4">
        <StatCard
          label="Total Produk"
          value={String(total)}
          icon={Package}
          tone="neutral"
          hint="Semua produk"
        />
        <StatCard
          label="Produk Aktif"
          value={String(active)}
          icon={CircleCheck}
          tone="primary"
          hint="Sedang ditawarkan"
        />
        <StatCard
          label="Produk Nonaktif"
          value={String(inactive)}
          icon={PauseCircle}
          tone="neutral"
          hint="Tidak ditawarkan"
        />
      </section>

      {/* Katalog interaktif */}
      <ProductCatalog products={products} />
    </div>
  );
}
