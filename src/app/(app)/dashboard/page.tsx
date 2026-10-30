import Link from "next/link";
import {
  Wallet,
  TrendingUp,
  ReceiptText,
  TrendingDown,
  Info,
  ArrowRight,
} from "lucide-react";
import { StatCard } from "@/components/dashboard/stat-card";
import { SalesChart } from "@/components/dashboard/sales-chart";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { TopProducts } from "@/components/dashboard/top-products";
import { RecentTransactions } from "@/components/dashboard/recent-transactions";
import { AiInsightCard } from "@/components/dashboard/ai-insight-card";
import { formatIDR, getDayName } from "@/lib/format";
import {
  DEMO_BUSINESS,
  DEMO_SALES_TREND,
  DEMO_STATS,
  DEMO_TOP_PRODUCTS,
  DEMO_RECENT_TRANSACTIONS,
  DEMO_AI_INSIGHT,
} from "@/lib/demo-data";

export const metadata = { title: "Dashboard" };

/**
 * DASHBOARD — TAHAP 1
 *
 * ⚠️ Semua data di sini dari src/lib/demo-data.ts (labels: data demo).
 * Di Tahap 2, setelah Supabase terhubung, pengambilan data berganti
 * menjadi query Supabase yang difilter dengan business_id milik pengguna.
 * Struktur komponen halaman sengaja dibuat agar tinggal ganti sumber data.
 */
export default function DashboardPage() {
  const greeting = "Selamat datang kembali!";
  const today = new Date();
  const dayLabel = `${getDayName(today)}, ${today.getDate()} ${today.toLocaleDateString("id-ID", { month: "long" })} ${today.getFullYear()}`;

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <section>
        <h2 className="text-xl font-bold tracking-tight sm:text-2xl">{greeting}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {DEMO_BUSINESS.businessName} · {dayLabel}
        </p>
      </section>

      {/* Statistik utama */}
      <section aria-label="Ringkasan bisnis" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Penjualan Hari Ini"
          value={formatIDR(DEMO_STATS.todaySales)}
          icon={Wallet}
          hint="Termasuk semua metode bayar"
        />
        <StatCard
          label="Penjualan Bulan Ini"
          value={formatIDR(DEMO_STATS.monthSales)}
          icon={TrendingUp}
          hint="Oktober 2026"
        />
        <StatCard
          label="Transaksi Bulan Ini"
          value={`${DEMO_STATS.monthTransactions}`}
          icon={ReceiptText}
          tone="neutral"
          hint="Pemasukan + pengeluaran"
        />
        <StatCard
          label="Pengeluaran Bulan Ini"
          value={formatIDR(DEMO_STATS.monthExpenses)}
          icon={TrendingDown}
          tone="expense"
          hint="Bahan baku & operasional"
        />
      </section>

      {/* Estimasi keuntungan — kartu aksen gelap */}
      <section aria-label="Estimasi keuntungan" className="rounded-2xl border border-primary-deep/80 bg-primary-deep px-6 py-5 text-white shadow-card">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-white/70">Estimasi Keuntungan Bulan Ini</p>
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-white/80">
                Estimasi
              </span>
            </div>
            <p className="mt-1 text-2xl font-bold tracking-tight">{formatIDR(DEMO_STATS.monthProfit)}</p>
          </div>
          <div className="flex items-start gap-2 rounded-xl bg-white/5 px-4 py-3 sm:max-w-md">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <p className="text-xs leading-relaxed text-white/60">
              Pemasukan dikurangi pengeluaran. Bukan keuntungan pasti — agar akurat,
              catat <strong className="text-white/80">modal per produk</strong> (tersedia di Tahap 3).
            </p>
          </div>
        </div>
      </section>

      {/* Grafik + aksi cepat */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-line bg-surface p-6 shadow-card lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold">Tren Penjualan</h2>
              <p className="text-xs text-muted-foreground">14 hari terakhir</p>
            </div>
            <Link
              href="/laporan"
              className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              Lihat laporan
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <SalesChart data={DEMO_SALES_TREND} />
        </div>

        <div className="rounded-2xl border border-line bg-surface p-6 shadow-card">
          <h2 className="text-base font-semibold">Aksi Cepat</h2>
          <p className="mb-4 text-xs text-muted-foreground">Tiga cara mencatat transaksi</p>
          <QuickActions />
        </div>
      </section>

      {/* Produk terlaris + transaksi terbaru */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-line bg-surface p-6 shadow-card">
          <h2 className="text-base font-semibold">Produk Terlaris</h2>
          <p className="mb-4 text-xs text-muted-foreground">Berdasarkan jumlah terjual</p>
          <TopProducts products={DEMO_TOP_PRODUCTS} />
        </div>

        <div className="rounded-2xl border border-line bg-surface p-6 shadow-card lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold">Transaksi Terbaru</h2>
              <p className="text-xs text-muted-foreground">6 aktivitas terakhir</p>
            </div>
            <Link
              href="/transaksi"
              className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              Lihat semua
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <RecentTransactions transactions={DEMO_RECENT_TRANSACTIONS} />
        </div>
      </section>

      {/* AI Insight */}
      <section aria-label="AI Business Insight">
        <AiInsightCard headline={DEMO_AI_INSIGHT.headline} bullets={DEMO_AI_INSIGHT.bullets} />
      </section>
    </div>
  );
}
