"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CircleAlert,
  CircleCheck,
  Loader2,
  Package,
  PauseCircle,
  PlayCircle,
  Plus,
  Search,
  SquarePen,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatIDR } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Product } from "@/types";
import { setProductActiveAction } from "./actions";
import { ProductForm } from "./product-form";

/**
 * KATALOG PRODUK (client) — Tahap P3.
 *
 * - Pencarian nama (filter instan di sisi klien atas data milik bisnis
 *   yang sudah dimuat server).
 * - Tabel rapi untuk desktop, kartu responsif untuk mobile.
 * - Form tambah/edit (ProductForm + server action P2).
 * - Tombol aktif/nonaktif via setProductActiveAction — nonaktifkan
 *   WAJIB dikonfirmasi; tidak ada penghapusan permanen.
 * - Loading (pending), empty state, error state, success feedback.
 */

type Notice = { type: "success" | "error"; text: string };
type FormMode = "closed" | "create" | { edit: Product };

function formatStock(stock: number | null, unit: string | null): string {
  if (stock === null) return "—";
  return unit ? `${stock} ${unit}` : String(stock);
}

export function ProductCatalog({ products }: { products: Product[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [formMode, setFormMode] = useState<FormMode>("closed");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => p.name.toLowerCase().includes(q));
  }, [products, query]);

  const editing = typeof formMode === "object" ? formMode.edit : null;

  /** Ubah status aktif/nonaktif (tanpa menghapus produk) */
  async function applyActive(product: Product, next: boolean) {
    setTogglingId(product.id);
    setNotice(null);
    try {
      const res = await setProductActiveAction(product.id, next);
      if (res.error) {
        setNotice({ type: "error", text: res.error });
      } else {
        setNotice({ type: "success", text: res.success ?? "Status produk diperbarui." });
        setConfirmId(null);
        router.refresh(); // ambil ulang data server (ringkasan & daftar)
      }
    } catch {
      setNotice({ type: "error", text: "Terjadi kesalahan. Silakan coba lagi." });
    } finally {
      setTogglingId(null);
    }
  }

  function handleToggle(product: Product) {
    if (product.is_active) {
      // Nonaktifkan = butuh konfirmasi eksplisit
      setConfirmId(product.id);
      return;
    }
    void applyActive(product, true);
  }

  const isFormOpen = formMode !== "closed";

  return (
    <div className="space-y-4">
      {/* Umpan balik (sukses/error) */}
      {notice && (
        <div
          role={notice.type === "error" ? "alert" : "status"}
          className={cn(
            "flex items-start justify-between gap-3 rounded-2xl border px-5 py-3.5 text-sm",
            notice.type === "error"
              ? "border-expense/20 bg-expense/5 text-expense"
              : "border-primary/25 bg-primary/5 text-primary-ink"
          )}
        >
          <span className="flex items-start gap-2.5">
            {notice.type === "error" ? (
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <CircleCheck className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            {notice.text}
          </span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            aria-label="Tutup pesan"
            className="shrink-0 rounded-md p-1 opacity-60 transition-opacity hover:opacity-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Form tambah / edit */}
      {isFormOpen && (
        <ProductForm
          mode={editing ? { edit: editing } : "create"}
          onSuccess={(message) => {
            setFormMode("closed");
            setNotice({ type: "success", text: message });
            router.refresh();
          }}
          onCancel={() => setFormMode("closed")}
        />
      )}

      {/* Toolbar: pencarian + tombol tambah */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari nama produk…"
            aria-label="Cari produk berdasarkan nama"
            className="pl-10"
            maxLength={160}
          />
        </div>
        {!isFormOpen && (
          <Button onClick={() => setFormMode("create")}>
            <Plus />
            Tambah Produk
          </Button>
        )}
      </div>

      {/* Daftar produk */}
      {products.length === 0 ? (
        /* Empty state: belum ada produk sama sekali */
        <section className="rounded-2xl border border-line bg-surface px-6 py-12 text-center shadow-card">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Package className="h-6 w-6" />
          </span>
          <h3 className="mt-4 text-base font-semibold text-foreground">Belum ada produk</h3>
          <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-muted-foreground">
            Tambahkan produk pertamamu — lengkapi harga jual, modal, dan stok agar
            pencatatan transaksi lebih mudah.
          </p>
          {!isFormOpen && (
            <Button className="mt-5" onClick={() => setFormMode("create")}>
              <Plus />
              Tambah Produk
            </Button>
          )}
        </section>
      ) : filtered.length === 0 ? (
        /* Empty state: pencarian tidak menemukan hasil */
        <section className="rounded-2xl border border-line bg-surface px-6 py-10 text-center shadow-card">
          <h3 className="text-base font-semibold text-foreground">Produk tidak ditemukan</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Tidak ada produk yang cocok dengan pencarianmu.
          </p>
          <Button variant="outline" className="mt-4" onClick={() => setQuery("")}>
            Hapus Pencarian
          </Button>
        </section>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            Menampilkan {filtered.length} dari {products.length} produk
          </p>

          {/* Tabel — desktop */}
          <div className="hidden overflow-hidden rounded-2xl border border-line bg-surface shadow-card md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produk</TableHead>
                  <TableHead className="text-right">Harga Jual</TableHead>
                  <TableHead className="hidden text-right lg:table-cell">Modal</TableHead>
                  <TableHead className="text-right">Stok</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell>
                      <p className="font-medium text-foreground">{product.name}</p>
                      {product.category && (
                        <p className="text-xs text-muted-foreground">{product.category}</p>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatIDR(product.selling_price)}
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums lg:table-cell">
                      {product.unit_cost !== null ? formatIDR(product.unit_cost) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatStock(product.stock, product.unit)}
                    </TableCell>
                    <TableCell>
                      {product.is_active ? (
                        <Badge>Aktif</Badge>
                      ) : (
                        <Badge variant="orange">Nonaktif</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {confirmId === product.id ? (
                        <div className="flex items-center justify-end gap-2">
                          <span className="text-xs text-muted-foreground">
                            Nonaktifkan?
                          </span>
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={togglingId === product.id}
                            onClick={() => void applyActive(product, false)}
                          >
                            {togglingId === product.id && <Loader2 className="h-4 w-4 animate-spin" />}
                            Ya
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={togglingId === product.id}
                            onClick={() => setConfirmId(null)}
                          >
                            Batal
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setNotice(null);
                              setConfirmId(null);
                              setFormMode({ edit: product });
                            }}
                          >
                            <SquarePen />
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={togglingId === product.id}
                            onClick={() => handleToggle(product)}
                          >
                            {togglingId === product.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : product.is_active ? (
                              <PauseCircle />
                            ) : (
                              <PlayCircle />
                            )}
                            {product.is_active ? "Nonaktifkan" : "Aktifkan"}
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Kartu — mobile */}
          <div className="space-y-3 md:hidden">
            {filtered.map((product) => (
              <article
                key={product.id}
                className="rounded-2xl border border-line bg-surface p-4 shadow-card"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {product.name}
                    </p>
                    {product.category && (
                      <p className="text-xs text-muted-foreground">{product.category}</p>
                    )}
                  </div>
                  {product.is_active ? <Badge>Aktif</Badge> : <Badge variant="orange">Nonaktif</Badge>}
                </div>

                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">Harga jual</dt>
                    <dd className="font-medium tabular-nums text-foreground">
                      {formatIDR(product.selling_price)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Modal</dt>
                    <dd className="tabular-nums text-foreground">
                      {product.unit_cost !== null ? formatIDR(product.unit_cost) : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Stok</dt>
                    <dd className="tabular-nums text-foreground">
                      {formatStock(product.stock, product.unit)}
                    </dd>
                  </div>
                </dl>

                {confirmId === product.id ? (
                  <div className="mt-4 rounded-xl border border-expense/20 bg-expense/5 px-3.5 py-3">
                    <p className="text-sm text-expense">
                      Nonaktifkan <strong>{product.name}</strong>? Produk tetap ada dan bisa
                      diaktifkan kembali.
                    </p>
                    <div className="mt-2.5 flex gap-2">
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={togglingId === product.id}
                        onClick={() => void applyActive(product, false)}
                      >
                        {togglingId === product.id && <Loader2 className="h-4 w-4 animate-spin" />}
                        Ya, Nonaktifkan
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={togglingId === product.id}
                        onClick={() => setConfirmId(null)}
                      >
                        Batal
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => {
                        setNotice(null);
                        setConfirmId(null);
                        setFormMode({ edit: product });
                      }}
                    >
                      <SquarePen />
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="flex-1"
                      disabled={togglingId === product.id}
                      onClick={() => handleToggle(product)}
                    >
                      {togglingId === product.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : product.is_active ? (
                        <PauseCircle />
                      ) : (
                        <PlayCircle />
                      )}
                      {product.is_active ? "Nonaktifkan" : "Aktifkan"}
                    </Button>
                  </div>
                )}
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
