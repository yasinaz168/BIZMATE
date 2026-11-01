import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, CircleAlert, ReceiptText } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { logDbError } from "@/lib/server-log";
import { formatIDR, getPaymentLabel } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  classifyTransactionRow,
  detailSourceBadge,
  detailStatusBadge,
  detailTypeBadge,
  isValidUUID,
  openTransactionById,
  openTransactionItems,
  toTransactionDetail,
  toTransactionItemDetail,
  type SingleQueryResult,
  type TransactionDetailRow,
  type TransactionItemRow,
} from "@/lib/transactions/detail";

export const metadata = { title: "Detail Transaksi" };

/**
 * =====================================================================
 * HALAMAN DETAIL TRANSAKSI (Tahap P5.4.3) — read-only.
 * =====================================================================
 * - id dari URL diambil secara pasif; kepemilikan ditentukan oleh
 *   business_id hasil lookup server (owner_id = auth.uid()) — URL hanya
 *   menyediakan `id`, TIDAK PERNAH business_id. RLS tetap pembatas baris.
 * - Tidak ada join ke products — snapshot `product_name` dipakai apa adanya.
 * - Items ditampilkan bila tersedia (POS); transaksi non-POS tanpa item
 *   menampilkan ringkasan quantity × unit_price dari tabel transactions.
 * - Read-only penuh: tidak ada edit/hapus/void, tidak menulis ke DB.
 */

const TX_COLUMNS =
  "id, business_id, type, title, quantity, unit_price, total, transacted_at, payment_method, source, status, notes, request_id";
const ITEMS_COLUMNS =
  "id, transaction_id, business_id, product_id, product_name, quantity, unit_price, total";

type PageParams = Promise<{ id: string }>;

/** Kuantitas tampil maksimal 2 desimal (data POS dapat berpecahan). */
function formatQuantity(value: number): string {
  return value.toLocaleString("id-ID", { maximumFractionDigits: 2 });
}

/* ---------- kartu untuk state khusus ---------- */

function BackLink() {
  return (
    <Link
      href="/transaksi"
      className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" />
      Daftar Transaksi
    </Link>
  );
}

function NotFoundCard() {
  return (
    <section className="flex flex-col items-center rounded-2xl border border-dashed border-line bg-surface px-6 py-12 text-center shadow-card">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <ReceiptText className="h-6 w-6" aria-hidden="true" />
      </span>
      <h2 className="mt-4 text-base font-semibold text-foreground">
        Transaksi tidak ditemukan
      </h2>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">
        Transaksi mungkin telah dihapus, atau bukan milik bisnismu.
      </p>
      <div className="mt-4">
        <Link
          href="/transaksi"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Kembali ke Daftar Transaksi
        </Link>
      </div>
    </section>
  );
}

function ErrorCard({ retryHref }: { retryHref: string }) {
  return (
    <section
      role="alert"
      className="flex flex-col items-start gap-3 rounded-2xl border border-expense/20 bg-expense/5 px-5 py-4 text-sm text-expense sm:flex-row sm:items-center sm:justify-between"
    >
      <span className="flex items-start gap-2.5">
        <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
        Gagal memuat detail transaksi. Periksa koneksi, lalu coba lagi.
      </span>
      <Link
        href={retryHref}
        className={buttonVariants({ variant: "outline", size: "sm" })}
      >
        Coba lagi
      </Link>
    </section>
  );
}

export default async function TransaksiDetailPage({ params }: { params: PageParams }) {
  // params.id adalah nilai ter-decode; validasi minimum → aman sebelum DB
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  // business_id = hasil lookup server (pemilik user ini), BUKAN dari URL
  const { data: business } = await supabase
    .from("businesses")
    .select("id")
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!business) {
    redirect("/onboarding");
  }

  const retryHref = `/transaksi/${encodeURIComponent(id)}`;

  // ---------- id bukan UUID → pasti bukan transaksi (tanpa query) ----------
  if (!isValidUUID(id)) {
    return (
      <div className="space-y-6">
        <BackLink />
        <NotFoundCard />
      </div>
    );
  }

  // ---------- transaksi (business_id server + id) ----------
  const txResult = (await openTransactionById(
    supabase.from("transactions").select(TX_COLUMNS),
    business.id,
    id
  )) as SingleQueryResult;

  const outcome = classifyTransactionRow(txResult);
  if (outcome === "error") {
    logDbError(
      { route: "transaksi/[id]", table: "transactions", op: "select" },
      txResult.error
    );
    return (
      <div className="space-y-6">
        <BackLink />
        <ErrorCard retryHref={retryHref} />
      </div>
    );
  }
  if (outcome === "missing") {
    return (
      <div className="space-y-6">
        <BackLink />
        <NotFoundCard />
      </div>
    );
  }

  const detail = toTransactionDetail(txResult.data as TransactionDetailRow);

  // ---------- item transaksi (business_id server + transaction_id) ----------
  const itemsResult = (await openTransactionItems(
    supabase.from("transaction_items").select(ITEMS_COLUMNS),
    business.id,
    detail.id
  )) as SingleQueryResult; // bentuk { data, error } yang sama

  let itemsFailed = false;
  let items: ReturnType<typeof toTransactionItemDetail>[] = [];
  if (itemsResult.error) {
    logDbError(
      {
        route: "transaksi/[id]",
        table: "transaction_items",
        op: "select",
        step: "rincian item",
      },
      itemsResult.error
    );
    itemsFailed = true;
  } else {
    const rows = (Array.isArray(itemsResult.data) ? itemsResult.data : []) as TransactionItemRow[];
    items = rows.map((row) => toTransactionItemDetail(row));
  }

  const source = detailSourceBadge(detail.source);
  const status = detailStatusBadge(detail.status);
  const typeB = detailTypeBadge(detail.type);
  const isIncome = detail.type === "income";
  const hasItems = items.length > 0;

  return (
    <div className="space-y-6">
      <BackLink />

      {/* ---------- header transaksi ---------- */}
      <section className="rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={isIncome ? "income" : "expense"}>{typeB.label}</Badge>
          {source && <Badge variant={source.variant}>{source.label}</Badge>}
          {status && <Badge variant={status.variant}>{status.label}</Badge>}
        </div>

        <h2 className="mt-3 text-lg font-bold tracking-tight text-foreground sm:text-xl">
          {detail.title}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {detail.dateLabel} · {detail.timeLabel} (WIB)
        </p>

        <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-x-8">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Metode pembayaran
              </dt>
              <dd className="mt-0.5 text-sm font-medium text-foreground">
                {getPaymentLabel(detail.paymentMethod)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                ID transaksi
              </dt>
              <dd className="mt-0.5 truncate font-mono text-xs text-foreground">
                {detail.id}
              </dd>
            </div>
            {/* request_id hanya untuk POS (idempotency RPC create_sale) */}
            {detail.source === "pos" && detail.requestId && (
              <div className="sm:col-span-2">
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Nomor request (idempotency)
                </dt>
                <dd className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                  {detail.requestId}
                </dd>
              </div>
            )}
          </dl>

          <div className="text-left sm:text-right">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Total transaksi
            </p>
            <p
              className={cn(
                "mt-0.5 text-2xl font-bold tabular-nums tracking-tight sm:text-3xl",
                isIncome ? "text-primary-ink" : "text-expense"
              )}
            >
              {isIncome ? "+" : "−"} {formatIDR(detail.total)}
            </p>
          </div>
        </div>

        {/* catatan — hanya bila tersedia */}
        {detail.notes && (
          <div className="mt-5 rounded-xl border border-line bg-muted/40 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Catatan
            </p>
            <p className="mt-1 whitespace-pre-line text-sm text-foreground">
              {detail.notes}
            </p>
          </div>
        )}
      </section>

      {/* ---------- rincian item / ringkasan ---------- */}
      {itemsFailed ? (
        <section
          role="alert"
          className="flex items-start gap-2.5 rounded-2xl border border-expense/20 bg-expense/5 px-5 py-4 text-sm text-expense"
        >
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Rincian item transaksi tidak dapat dimuat. Coba lagi nanti.</span>
        </section>
      ) : hasItems ? (
        <section className="rounded-2xl border border-line bg-surface shadow-card">
          <div className="px-5 pt-5">
            <h3 className="text-sm font-semibold text-foreground">
              Rincian item ({items.length})
            </h3>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produk</TableHead>
                <TableHead className="text-right">Kuantitas</TableHead>
                <TableHead className="text-right">Harga Satuan</TableHead>
                <TableHead className="text-right">Subtotal</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">
                    {item.productName}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatQuantity(item.quantity)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatIDR(item.unitPrice)}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatIDR(item.subtotal)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex items-center justify-between px-4 pb-4 pt-2 sm:px-5 sm:pb-5">
            <p className="text-xs text-muted-foreground">Total transaksi</p>
            <p className="text-sm font-bold tabular-nums text-foreground">
              {formatIDR(detail.total)}
            </p>
          </div>
        </section>
      ) : (
        <section className="rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-6">
          <h3 className="text-sm font-semibold text-foreground">Ringkasan</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Transaksi ini tidak memiliki rincian item — total dicatat sebagai
            satu ringkasan.
          </p>
          <dl className="mt-4 space-y-2.5 text-sm">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">Jumlah</dt>
              <dd className="tabular-nums text-foreground">
                {formatQuantity(detail.quantity)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">Harga satuan</dt>
              <dd className="tabular-nums text-foreground">
                {formatIDR(detail.unitPrice)}
              </dd>
            </div>
            <div
              className="flex items-center justify-between gap-4 border-t border-line pt-2.5"
              aria-label="Total transaksi"
            >
              <dt className="font-medium text-foreground">Total</dt>
              <dd
                className={cn(
                  "font-semibold tabular-nums",
                  isIncome ? "text-primary-ink" : "text-expense"
                )}
              >
                {formatIDR(detail.total)}
              </dd>
            </div>
          </dl>
        </section>
      )}
    </div>
  );
}
