import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CircleAlert,
  ReceiptText,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { logDbError } from "@/lib/server-log";
import { formatIDR, getPaymentLabel, getTypeLabel } from "@/lib/format";
import { StatCard } from "@/components/dashboard/stat-card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  buildTransactionsHref,
  clampPage,
  hasActiveTransactionFilter,
  MAX_SEARCH_LENGTH,
  openTransactionList,
  openTransactionTotals,
  PAGE_SIZE,
  parseTransactionsParams,
  SUMMARY_MAX_ROWS,
  type DbQueryResult,
} from "@/lib/transactions/filters";
import {
  sourceBadge,
  statusBadge,
  summarizeTransactionTotals,
  toTransactionListItem,
} from "@/lib/transactions/view";

export const metadata = { title: "Transaksi" };

/**
 * =====================================================================
 * HALAMAN DAFTAR TRANSAKSI (Tahap P5.4.2) — read-only.
 * =====================================================================
 * - Data dari tabel `transactions` milik bisnis pengguna terautentikasi.
 *   business_id = hasil lookup server (owner_id = user.id) — TIDAK PERNAH
 *   dari browser. RLS tetap pembatas baris di database.
 * - Search (q) & filter (tanggal/jenis/sumber/metode/status) dibangun
 *   di SERVER (lib/transactions/filters.ts) — bukan filter di browser.
 * - Pagination server-side: .range(from, to) + count "exact".
 * - Halaman /transaksi/baru (manual) & detail item: tahap berikutnya.
 * - Transaksi POS read-only di halaman ini; tidak ada tulis/hapus.
 */

const LIST_COLUMNS =
  "id, title, type, total, transacted_at, payment_method, source, status";
// status ikut — guard agregasi R1 (draft & void tidak dijumlahkan)
const TOTALS_COLUMNS = "type, total, status";
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Kartu "coba lagi" — pesan generik, detail DB hanya ke log server. */
function ErrorCard({ retryHref }: { retryHref: string }) {
  return (
    <section
      role="alert"
      className="flex flex-col items-start gap-3 rounded-2xl border border-expense/20 bg-expense/5 px-5 py-4 text-sm text-expense sm:flex-row sm:items-center sm:justify-between"
    >
      <span className="flex items-start gap-2.5">
        <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
        Gagal memuat transaksi. Periksa koneksi, lalu coba lagi.
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

export default async function TransaksiPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const filters = parseTransactionsParams(params);

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

  // ---------- daftar transaksi (pagination + count exact) ----------
  let list = (await openTransactionList(
    supabase.from("transactions").select(LIST_COLUMNS, { count: "exact" }),
    business.id,
    filters
  )) as DbQueryResult;

  if (list.error) {
    logDbError({ route: "transaksi/page", table: "transactions", op: "select" }, list.error);
    return (
      <div className="space-y-6">
        <HeaderSection />
        <ErrorCard retryHref={buildTransactionsHref(filters, filters.page)} />
      </div>
    );
  }

  const totalCount =
    typeof list.count === "number" ? list.count : (Array.isArray(list.data) ? list.data.length : 0);

  // Halaman di luar rentang (mis. URL lama) → ambil ulang halaman terakhir.
  const safePage = clampPage(filters.page, totalCount);
  if (safePage !== filters.page) {
    list = (await openTransactionList(
      supabase.from("transactions").select(LIST_COLUMNS, { count: "exact" }),
      business.id,
      { ...filters, page: safePage }
    )) as DbQueryResult;
  }

  // ---------- ringkasan nominal berdasarkan filter aktif ----------
  // Nominal dihitung dari SEMUA baris yang cocok, bukan hanya halaman ini.
  // Jika filter mencakup > SUMMARY_MAX_ROWS transaksi, ringkasan nominal
  // disembunyikan (menghindari query tanpa batas) — jumlah transaksi tetap
  // tampil dari count exact.
  let summary: { income: number; expense: number } | null = null;
  let summaryNote: string | null = null;
  if (totalCount > 0) {
    if (totalCount <= SUMMARY_MAX_ROWS) {
      const totals = (await openTransactionTotals(
        supabase.from("transactions").select(TOTALS_COLUMNS),
        business.id,
        filters
      )) as DbQueryResult;
      if (totals.error) {
        logDbError(
          {
            route: "transaksi/page",
            table: "transactions",
            op: "select",
            step: "ringkasan nominal",
          },
          totals.error
        );
        summaryNote = "Ringkasan nominal sementara tidak dapat dihitung.";
      } else {
        summary = summarizeTransactionTotals(
          (totals.data ?? []) as Array<{ type?: unknown; total?: unknown }>
        );
      }
    } else {
      summaryNote =
        `Filter aktif mencakup lebih dari ${SUMMARY_MAX_ROWS.toLocaleString("id-ID")} transaksi — ringkasan nominal disembunyikan.`;
    }
  }

  const rows = (list.data ?? []) as Array<Record<string, unknown>>;
  const items = rows.map((row) => toTransactionListItem(row));
  const filterActive = hasActiveTransactionFilter(filters);
  const hasAnyTransaction = totalCount > 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <HeaderSection />

      {/* ---------- ringkasan (hanya saat ada data) ---------- */}
      {hasAnyTransaction && (
        <section
          aria-label="Ringkasan transaksi"
          className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4"
        >
          <StatCard
            label="Pemasukan"
            value={summary ? formatIDR(summary.income) : "—"}
            hint={summary ? "Total sesuai filter aktif" : (summaryNote ?? undefined)}
            icon={TrendingUp}
            tone="primary"
          />
          <StatCard
            label="Pengeluaran"
            value={summary ? formatIDR(summary.expense) : "—"}
            hint={summary ? "Total sesuai filter aktif" : (summaryNote ?? undefined)}
            icon={TrendingDown}
            tone="expense"
          />
          <StatCard
            label="Jumlah Transaksi"
            value={totalCount.toLocaleString("id-ID")}
            hint="Dalam rentang filter aktif (semua status)"
            icon={ReceiptText}
            tone="neutral"
          />
        </section>
      )}

      {/* ---------- pencarian & filter (form GET — tetap pakai server) ---------- */}
      <form
        action="/transaksi"
        method="get"
        aria-label="Cari dan filter transaksi"
        className="space-y-4 rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5"
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="q">Cari keterangan / catatan</Label>
            <Input
              id="q"
              name="q"
              type="search"
              maxLength={MAX_SEARCH_LENGTH}
              defaultValue={filters.q}
              placeholder="Mis. kopi, sewa, supplier…"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="from">Dari tanggal</Label>
            <Input id="from" name="from" type="date" defaultValue={filters.fromDay ?? ""} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="to">Sampai tanggal</Label>
            <Input id="to" name="to" type="date" defaultValue={filters.toDay ?? ""} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="type">Jenis</Label>
            <Select id="type" name="type" defaultValue={filters.type ?? ""}>
              <option value="">Semua jenis</option>
              <option value="income">{getTypeLabel("income")}</option>
              <option value="expense">{getTypeLabel("expense")}</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="source">Sumber</Label>
            <Select id="source" name="source" defaultValue={filters.source ?? ""}>
              <option value="">Semua sumber</option>
              <option value="pos">POS</option>
              <option value="ai_chat">AI Chat</option>
              <option value="receipt_scan">Nota</option>
              <option value="manual">Manual</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="payment_method">Metode pembayaran</Label>
            <Select
              id="payment_method"
              name="payment_method"
              defaultValue={filters.paymentMethod ?? ""}
            >
              <option value="">Semua metode</option>
              <option value="cash">{getPaymentLabel("cash")}</option>
              <option value="transfer">{getPaymentLabel("transfer")}</option>
              <option value="qris">{getPaymentLabel("qris")}</option>
              <option value="ewallet">{getPaymentLabel("ewallet")}</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="status">Status</Label>
            <Select id="status" name="status" defaultValue={filters.status ?? ""}>
              <option value="">Semua status</option>
              <option value="completed">Selesai</option>
              <option value="draft">Draf</option>
              <option value="void">Dibatalkan</option>
            </Select>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button type="submit" size="sm">
            Terapkan Filter
          </Button>
          {filterActive && (
            <Link href="/transaksi" className={buttonVariants({ variant: "outline", size: "sm" })}>
              Reset
            </Link>
          )}
        </div>
      </form>

      {/* ---------- daftar / empty state ---------- */}
      {!hasAnyTransaction ? (
        filterActive ? (
          <section className="rounded-2xl border border-line bg-surface px-6 py-10 text-center shadow-card">
            <ReceiptText className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-foreground">
              Tidak ada transaksi yang cocok dengan filter saat ini.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Ubah kata kunci atau rentang tanggal, atau reset filter.
            </p>
            <div className="mt-4 flex justify-center">
              <Link
                href="/transaksi"
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                Reset filter
              </Link>
            </div>
          </section>
        ) : (
          <section className="flex flex-col items-center rounded-2xl border border-dashed border-line bg-surface px-6 py-12 text-center shadow-card">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <ReceiptText className="h-6 w-6" aria-hidden="true" />
            </span>
            <h3 className="mt-4 text-base font-semibold text-foreground">
              Belum ada transaksi tercatat
            </h3>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              Mulai catat penjualan dari Kasir, atau minta AI Assistant mencatat
              transaksi untukmu.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Link href="/kasir" className={buttonVariants({ size: "sm" })}>
                Mulai di Kasir
              </Link>
              <Link
                href="/assistant"
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                Coba AI Assistant
              </Link>
            </div>
          </section>
        )
      ) : (
        <>
          {/* ---------- tabel ---------- */}
          <div className="rounded-2xl border border-line bg-surface shadow-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tanggal</TableHead>
                  <TableHead>Keterangan</TableHead>
                  <TableHead className="hidden md:table-cell">Sumber</TableHead>
                  <TableHead>Jenis</TableHead>
                  <TableHead className="hidden md:table-cell">Metode</TableHead>
                  <TableHead className="hidden md:table-cell">Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => {
                  const source = sourceBadge(item.source);
                  const status = statusBadge(item.status);
                  const isIncome = item.type === "income";
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {item.dateLabel}
                      </TableCell>
                      <TableCell className="max-w-[160px] truncate font-medium sm:max-w-none">
                        {item.title}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {source ? <Badge variant={source.variant}>{source.label}</Badge> : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={isIncome ? "income" : "expense"}>
                          {getTypeLabel(item.type)}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground md:table-cell">
                        {getPaymentLabel(item.paymentLabel)}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {status ? <Badge variant={status.variant}>{status.label}</Badge> : "—"}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "whitespace-nowrap text-right font-semibold tabular-nums",
                          isIncome ? "text-primary-ink" : "text-expense"
                        )}
                      >
                        {isIncome ? "+" : "−"} {formatIDR(item.total)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* ---------- pagination (server-side) ---------- */}
          <nav
            aria-label="Navigasi halaman"
            className="flex items-center justify-between gap-3"
          >
            <p className="text-xs text-muted-foreground" aria-live="polite">
              Halaman {safePage} dari {totalPages} · {totalCount.toLocaleString("id-ID")}{" "}
              transaksi
            </p>
            <div className="flex items-center gap-2">
              {safePage > 1 ? (
                <Link
                  href={buildTransactionsHref(filters, safePage - 1)}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                  aria-label="Ke halaman sebelumnya"
                >
                  <ArrowLeft />
                  Sebelumnya
                </Link>
              ) : (
                <span aria-hidden="true" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "cursor-not-allowed opacity-40")}>
                  <ArrowLeft />
                  Sebelumnya
                </span>
              )}
              {safePage < totalPages ? (
                <Link
                  href={buildTransactionsHref(filters, safePage + 1)}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                  aria-label="Ke halaman berikutnya"
                >
                  Berikutnya
                  <ArrowRight />
                </Link>
              ) : (
                <span aria-hidden="true" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "cursor-not-allowed opacity-40")}>
                  Berikutnya
                  <ArrowRight />
                </span>
              )}
            </div>
          </nav>
        </>
      )}
    </div>
  );
}

/** Header halaman — dipisah agar cabang error/isi memakai yang sama. */
function HeaderSection() {
  return (
    <section>
      <h2 className="text-xl font-bold tracking-tight sm:text-2xl">Transaksi</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Riwayat lengkap pemasukan dan pengeluaran bisnismu — dari Kasir, AI
        Assistant, nota, dan input manual.
      </p>
    </section>
  );
}

