"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import {
  CircleAlert,
  CircleCheck,
  Loader2,
  Minus,
  Package,
  Plus,
  Search,
  ShoppingCart,
  Trash2,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatIDR } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  addToCart,
  isStockDepleted,
  changeQuantity,
  finalizeSale,
  nextRequestId,
  removeFromCart,
  sumSale,
  type CartLine,
} from "@/lib/pos/cart";
import type { CreateSaleResult, Product, PaymentMethod } from "@/types";
import { createSaleAction } from "./actions";

const PAYMENT_OPTIONS: Array<{ value: PaymentMethod; label: string }> = [
  { value: "cash", label: "Tunai" },
  { value: "transfer", label: "Transfer" },
  { value: "qris", label: "QRIS" },
  { value: "ewallet", label: "E-Wallet" },
];

function paymentLabel(method: PaymentMethod): string {
  return PAYMENT_OPTIONS.find((option) => option.value === method)?.label ?? method;
}

/**
 * NOTA CHECKOUT — hasil RPC create_sale + metode bayar yang dikirim.
 *
 * - Data monetary/nomor transaksi PERSIS hasil RPC (tidak di-fabricate).
 * - payment_method TIDAK dikembalikan RPC; label diambil dari payload
 *   yang dikirim kasir (data yang benar-benar diproses database).
 *   Untuk REPLAY, metode asli milik transaksi lama — sengaja tidak
 *   ditampilkan bila tak pasti (lihat blok nota).
 */
interface SaleReceipt {
  sale: CreateSaleResult;
  paymentLabel: string;
}

/**
 * KATALOG + KERANJANG + CHECKOUT POS (Tahap P5.3).
 *
 * Aturan keamanan yang dipegang UI:
 * - Hanya produk AKTIF ditampilkan (server page memfilter is_active=true).
 * - Harga/nama hanya ditampilkan dari data katalog server — yang dikirim
 *   checkout HANYA product_id + quantity (kontrak RPC create_sale).
 * - request_id dibuat SEKALI per sesi checkout dan DIPERTAHANKAN saat
 *   retry (checkout gagal tidak mengubahnya); baru dibuat ulang setelah
 *   checkout sukses (finalizeSale).
 * - Stok tidak dikurangi dari browser — RPC create_sale yang mengelola.
 */
export function PosClient({ products }: { products: Product[] }) {
  const router = useRouter();

  // ---- keranjang & sesi checkout ----
  const [lines, setLines] = useState<CartLine[]>([]);
  const [requestId, setRequestId] = useState<string>(""); // dibuat saat mount
  // nota sukses checkout — null saat gagal / belum checkout
  const [receipt, setReceipt] = useState<SaleReceipt | null>(null);

  // ---- pembayaran ----
  const [payment, setPayment] = useState<PaymentMethod>("cash");
  const [notes, setNotes] = useState("");
  const [confirming, setConfirming] = useState(false);

  // ---- katalog ----
  const [query, setQuery] = useState("");

  // ---- checkout via server action P5.2 ----
  const [actionState, formAction, pending] = useActionState(createSaleAction, null);

  // request_id dibuat sekali per sesi (efek, hindari selisih SSR/hidrasi)
  useEffect(() => {
    if (!requestId) {
      setRequestId(nextRequestId());
    }
  }, [requestId]);

  // HANYA checkout sukses yang mengosongkan keranjang & menyegarkan data —
  // checkout gagal: keranjang, request_id, dan nota DIPERTAHANKAN untuk
  // dicoba ulang (retry memakai request_id yang sama).
  useEffect(() => {
    if (!actionState?.sale) return;

    const outcome = finalizeSale(lines, requestId); // keranjang kosong + request_id baru
    setLines(outcome.lines);
    setRequestId(outcome.requestId);
    setConfirming(false);
    setNotes(""); // catatan milik transaksi yang sudah selesai
    setReceipt({
      sale: actionState.sale,
      paymentLabel: paymentLabel(payment),
    });
    router.refresh(); // stok & ringkasan dari server ikut terbaru
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionState]);

  const summary = useMemo(() => sumSale(lines), [lines]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) => p.name.toLowerCase().includes(q) || p.category?.toLowerCase().includes(q)
    );
  }, [products, query]);

  function handleAddToCart(product: Product) {
    setReceipt(null);
    setLines((current) => addToCart(current, product, 1));
  }

  function handleCheckoutClick() {
    if (lines.length === 0) return;
    setConfirming(true);
  }

  return (
    <div className="space-y-6">
      {/* ---------- umpan balik hasil RPC ---------- */}
      {actionState?.error && (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 rounded-2xl border border-expense/20 bg-expense/5 px-5 py-3.5 text-sm text-expense"
        >
          <span className="flex items-start gap-2.5">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            {actionState.error}
          </span>
        </div>
      )}

      {/* ---------- nota & tombol penjualan baru (hanya checkout sukses) ---------- */}
      {/* Nota dari checkout sebelumnya disembunyikan bila percobaan baru gagal
          (agar kasir tidak mengira penjualan sudah masuk). */}
      {receipt && !actionState?.error && (
        <section
          role="status"
          aria-live="polite"
          className="rounded-2xl border border-primary/30 bg-primary/5 px-5 py-4 shadow-card"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                <CircleCheck className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-semibold text-primary-ink">
                  {receipt.sale.idempotent_replay
                    ? "Checkout sudah pernah diproses"
                    : "Checkout berhasil"}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {receipt.sale.idempotent_replay
                    ? "Permintaan ulang dikembalikan dari transaksi sebelumnya — tidak ada penjualan baru."
                    : "Transaksi tersimpan di riwayat penjualan."}
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setReceipt(null)}
              aria-label="Tutup nota"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <dl className="mt-3 space-y-1.5 rounded-xl bg-surface px-4 py-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="shrink-0 text-muted-foreground">No. transaksi</dt>
              <dd className="truncate font-mono text-xs text-foreground">
                {receipt.sale.transaction_id}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Total pembayaran</dt>
              <dd className="font-semibold tabular-nums text-foreground">
                {formatIDR(receipt.sale.total)}
              </dd>
            </div>
            {/* Metode bayar = yang dikirim kasir (TERSIMPAN oleh database).
                Bila replay, metode asli milik transaksi lama — sengaja
                tidak ditampilkan bila tak pasti (label klien bisa berbeda). */}
            {receipt.sale.idempotent_replay ? null : (
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Metode pembayaran</dt>
                <dd className="text-foreground">{receipt.paymentLabel}</dd>
              </div>
            )}
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Jumlah item</dt>
              <dd className="tabular-nums text-foreground">
                {receipt.sale.item_count} item ({receipt.sale.total_quantity} unit)
              </dd>
            </div>
          </dl>

          <div className="mt-3 flex justify-end">
            <Button size="sm" onClick={() => setReceipt(null)} aria-label="Mulai penjualan baru">
              <Plus />
              Mulai Penjualan Baru
            </Button>
          </div>
        </section>
      )}

      {/* ---------- katalog & keranjang: dua kolom di desktop ---------- */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* ============ KATALOG PRODUK ============ */}
        <section aria-label="Katalog produk" className="space-y-4 lg:col-span-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Cari produk di katalog…"
              aria-label="Cari produk di katalog"
              className="pl-10"
            />
          </div>

          {products.length === 0 ? (
            <div className="rounded-2xl border border-line bg-surface px-6 py-10 text-center shadow-card">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Package className="h-6 w-6" />
              </span>
              <h3 className="mt-4 text-base font-semibold text-foreground">
                Katalog produk masih kosong
              </h3>
              <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-muted-foreground">
                Tambahkan produk aktif di menu Produk, lalu produk itu bisa langsung
                dijual lewat kasir ini.
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl border border-line bg-surface px-6 py-10 text-center shadow-card">
              <h3 className="text-base font-semibold text-foreground">Tidak ditemukan</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Tidak ada produk yang cocok dengan &quot;{query}&quot;.
              </p>
              <Button variant="outline" className="mt-4" onClick={() => setQuery("")}>
                Hapus pencarian
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              {filtered.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-3 shadow-card"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatIDR(item.selling_price)}
                      {item.unit ? ` / ${item.unit}` : ""}
                      {item.stock !== null ? ` · stok ${item.stock}` : ""}
                    </p>
                    {item.category && (
                      <p className="mt-1 text-xs text-muted-foreground">{item.category}</p>
                    )}
                  </div>
                  {(() => {
                    // Produk stok habis tetap terlihat, tetapi tidak bisa
                    // dimasukkan ke keranjang (pengaman utama: RPC create_sale).
                    const stockOut = isStockDepleted(item.stock);
                    return (
                      <Button
                        size="sm"
                        disabled={pending || stockOut}
                        onClick={() => handleAddToCart(item)}
                        aria-label={
                          stockOut
                            ? `${item.name} stok habis`
                            : `Tambahkan ${item.name} ke keranjang`
                        }
                      >
                        <Plus />
                        {stockOut ? "Stok habis" : "Tambah"}
                      </Button>
                    );
                  })()}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ============ KERANJANG BELANJA ============ */}
        <section
          aria-label="Keranjang"
          className="space-y-4 self-start rounded-2xl border border-line bg-surface p-5 shadow-card lg:col-span-2"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-primary" />
              <h3 className="text-base font-semibold text-foreground">Keranjang</h3>
              {lines.length > 0 && (
                <Badge>
                  {summary.totalQuantity} unit · {lines.length} item
                </Badge>
              )}
            </div>
            {lines.length > 0 && (
              <span className="text-sm font-semibold tabular-nums text-foreground">
                {formatIDR(summary.total)}
              </span>
            )}
          </div>

          {lines.length === 0 ? (
            <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
              <Package className="h-4 w-4" />
              Keranjang kosong — pilih produk dari katalog untuk mulai penjualan.
            </p>
          ) : (
            <>
              {lines.map((line) => (
                <div
                  key={line.product.id}
                  className="rounded-xl border border-line/70 px-3.5 py-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {line.product.name}
                      </p>
                      <p className="text-xs tabular-nums text-muted-foreground">
                        {formatIDR(line.product.selling_price)} × {line.quantity}
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                      {formatIDR(Math.round(line.quantity * line.product.selling_price * 100) / 100)}
                    </p>
                  </div>

                  <div className="mt-2.5 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5" aria-label={`Atur jumlah ${line.product.name}`}>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className={cn("h-8 w-8 px-0", pending && "opacity-50")}
                        disabled={pending}
                        onClick={() => setLines(changeQuantity(lines, line.product.id, line.quantity - 1))}
                        aria-label={`Kurangi quantity ${line.product.name}`}
                      >
                        <Minus className="h-4 w-4" />
                      </Button>
                      <span className="min-w-9 text-center text-sm font-semibold tabular-nums text-foreground">
                        {line.quantity}
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className={cn("h-8 w-8 px-0", pending && "opacity-50")}
                        disabled={pending}
                        onClick={() => setLines(changeQuantity(lines, line.product.id, line.quantity + 1))}
                        aria-label={`Tambah quantity ${line.product.name}`}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className={cn("text-expense hover:bg-expense/10 hover:text-expense", pending && "opacity-50")}
                      disabled={pending}
                      onClick={() => setLines(removeFromCart(lines, line.product.id))}
                      aria-label={`Hapus ${line.product.name} dari keranjang`}
                    >
                      <Trash2 className="h-4 w-4" />
                      Hapus
                    </Button>
                  </div>
                </div>
              ))}

              {/* Total ringkas */}
              <div className="rounded-xl bg-muted px-4 py-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Total kuantitas</span>
                  <span className="tabular-nums text-foreground">{summary.totalQuantity} unit</span>
                </div>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-sm font-medium text-muted-foreground">Total</span>
                  <span className="text-lg font-bold tabular-nums text-primary-ink">
                    {formatIDR(summary.total)}
                  </span>
                </div>
              </div>

              {/* Pembayaran & catatan */}
              {!confirming && (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="kasir-payment">Metode pembayaran</Label>
                    <Select
                      id="kasir-payment"
                      value={payment}
                      disabled={pending}
                      onChange={(event) => setPayment(event.target.value as PaymentMethod)}
                    >
                      {PAYMENT_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="kasir-notes">Catatan (opsional)</Label>
                    <Textarea
                      id="kasir-notes"
                      value={notes}
                      maxLength={500}
                      disabled={pending}
                      onChange={(event) => setNotes(event.target.value)}
                      placeholder="Mis. untuk pelanggan Ibu Wati — bungkus terpisah"
                      rows={2}
                    />
                  </div>
                </div>
              )}

              {/* Konfirmasi sebelum checkout */}
              {confirming && (
                <form action={formAction} className="rounded-xl border border-primary/30 bg-primary/5 px-3.5 py-3.5">
                  <input type="hidden" name="request_id" value={requestId} />
                  <input type="hidden" name="payment_method" value={payment} />
                  <input type="hidden" name="notes" value={notes} />
                  <input
                    type="hidden"
                    name="items"
                    value={JSON.stringify(
                      lines.map((line) => ({ product_id: line.product.id, quantity: line.quantity }))
                    )}
                  />

                  <p className="text-sm font-semibold text-primary-ink">Konfirmasi pembayaran</p>
                  {actionState?.error && (
                    <p
                      role="alert"
                      className="mt-1.5 rounded-lg border border-expense/20 bg-expense/5 px-3 py-2 text-xs leading-relaxed text-expense"
                    >
                      {actionState.error}
                    </p>
                  )}
                  <dl className="mt-2 space-y-1 text-sm">
                    <div className="flex items-center justify-between">
                      <dt className="text-muted-foreground">Metode</dt>
                      <dd className="text-foreground">
                        {PAYMENT_OPTIONS.find((option) => option.value === payment)?.label ?? payment}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between">
                      <dt className="text-muted-foreground">Jumlah item</dt>
                      <dd className="tabular-nums text-foreground">{summary.totalQuantity} unit</dd>
                    </div>
                    <div className="flex items-center justify-between">
                      <dt className="text-muted-foreground">Total</dt>
                      <dd className="font-semibold tabular-nums text-foreground">
                        {formatIDR(summary.total)}
                      </dd>
                    </div>
                  </dl>
                  {pending && (
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Memproses pembayaran…
                    </p>
                  )}

                  <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-end">
                    <Button type="submit" disabled={pending}>
                      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CircleCheck />}
                      Ya, Bayar Sekarang
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={pending}
                      onClick={() => setConfirming(false)}
                    >
                      Kembali
                    </Button>
                  </div>
                </form>
              )}

              {!confirming && (
                <Button className="w-full" size="lg" disabled={pending} onClick={handleCheckoutClick}>
                  {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingCart />}
                  Checkout
                </Button>
              )}

              <p className="text-center text-xs text-muted-foreground">
                Harga &amp; total dihitung ulang oleh server saat checkout — keranjang ini
                hanya ringkasan penjualan.
              </p>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
