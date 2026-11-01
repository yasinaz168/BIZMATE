import { redirect } from "next/navigation";
import { CircleAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { logDbError } from "@/lib/server-log";
import type { Product } from "@/types";
import { PosClient } from "./pos-client";

export const metadata = { title: "Kasir" };

/**
 * HALAMAN KASIR / POS (Tahap P5.3).
 *
 * Server component:
 * - Mengambil HANYA produk AKTIF milik bisnis pengguna terautentikasi
 *   (business_id hasil lookup server — tidak pernah dari browser).
 * - Keranjang, konfirmasi, dan checkout ditangani PosClient (client)
 *   melalui createSaleAction P5.2 → RPC create_sale (database yang
 *   memvalidasi kepemilikan, harga, stok, dan menghitung total).
 * - Browser hanya mengirim product_id + quantity.
 */

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

export default async function KasirPage() {
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
    .eq("is_active", true) // hanya produk aktif yang dijual di kasir
    .order("name", { ascending: true });

  if (error) {
    // Detail database dicatat aman di server — tidak ditampilkan ke pengguna
    logDbError({ route: "kasir/page", table: "products", op: "select" }, error);
    return (
      <div className="space-y-6">
        <section>
          <h2 className="text-xl font-bold tracking-tight sm:text-2xl">Kasir</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Jual produk dari katalog dan catat transaksi.
          </p>
        </section>
        <section
          role="alert"
          className="flex items-start gap-2.5 rounded-2xl border border-expense/20 bg-expense/5 px-5 py-4 text-sm text-expense"
        >
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Gagal memuat katalog produk. Muat ulang halaman, lalu coba lagi.</span>
        </section>
      </div>
    );
  }

  const products = (rows ?? []).map((row) => toProduct(row as Record<string, unknown>));

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-xl font-bold tracking-tight sm:text-2xl">Kasir</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Jual produk aktif dari katalog, atur keranjang, lalu checkout dengan
          satu klik.
        </p>
      </section>

      <PosClient products={products} />
    </div>
  );
}
