import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Wallet,
  TrendingUp,
  ReceiptText,
  TrendingDown,
  Info,
  ArrowRight,
  Bot,
  Camera,
  CirclePlus,
  ChevronRight,
} from "lucide-react";
import { StatCard } from "@/components/dashboard/stat-card";
import { SalesChart } from "@/components/dashboard/sales-chart";
import { TopProducts } from "@/components/dashboard/top-products";
import { RecentTransactions } from "@/components/dashboard/recent-transactions";
import { AiInsightCard } from "@/components/dashboard/ai-insight-card";
import { formatIDR } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { getDashboardData } from "@/lib/dashboard-data";
import { buildAutoInsight } from "@/lib/insight";

export const metadata = { title: "Dashboard" };

/**
 * DASHBOARD — TAHAP 2
 * Semua angka di halaman ini dihitung dari tabel `transactions` milik
 * business pengguna (RLS aktif). Tidak ada lagi data demo.
 */
export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: business } = await supabase
    .from("businesses")
    .select("id, name")
    .eq("owner_id", user.id)
    .maybeSingle();

  // Layout sudah menjamin business ada — guard ini untuk TS & keamanan ganda
  if (!business) redirect("/onboarding");

  const data = await getDashboardData(supabase, business.id);

  // Greeting: nama pemilik dari profiles
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();

  const firstName = (profile?.full_name ?? "").split(" ")[0];
  const greeting = firstName ? `Selamat datang kembali, ${firstName}!` : "Selamat datang kembali!";
  const greetingSub = `${business.name} · ${dayLabelNow()}`;

  const insight = buildAutoInsight(
    // ambil baris mentah yang sama sudah dipakai agregasi — query lagi ringan
    await fetchMonthRows(supabase, business.id)
  );
  const monthLabelNow = new Intl.DateTimeFormat("id-ID", { month: "long" }).format(new Date());

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <section>
        <h2 className="text-xl font-bold tracking-tight sm:text-2xl">{greeting}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{greetingSub}</p>
      </section>

      {/* Empty state: belum ada transaksi sama sekali */}
      {data.hasNoTransactionAtAll && <FirstTransactionCard />}

      {/* Statistik utama */}
      <section aria-label="Ringkasan bisnis" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Penjualan Hari Ini"
          value={formatIDR(data.todaySales)}
          icon={Wallet}
          hint="Pemasukan tercatat hari ini"
        />
        <StatCard
          label="Penjualan Bulan Ini"
          value={formatIDR(data.monthSales)}
          icon={TrendingUp}
          hint={`${monthLabelNow} — semua metode bayar`}
        />
        <StatCard
          label="Transaksi Bulan Ini"
          value={`${data.monthTransactions}`}
          icon={ReceiptText}
          tone="neutral"
          hint="Pemasukan + pengeluaran"
        />
        <StatCard
          label="Pengeluaran Bulan Ini"
          value={formatIDR(data.monthExpenses)}
          icon={TrendingDown}
          tone="expense"
          hint={monthLabelNow}
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
            <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight sm:text-3xl">
              {formatIDR(data.monthProfit)}
            </p>
          </div>
          <div className="flex items-start gap-2 rounded-xl bg-white/5 px-4 py-3 sm:max-w-md">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary-bright" />
            <p className="text-xs leading-relaxed text-white/60">
              Penjualan dikurangi pengeluaran tercatat. Agar akurat, nanti catat{" "}
              <strong className="text-white/80">modal per produk</strong> (Tahap 3).
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
              className="inline-flex items-center gap-1 text-sm font-medium text-primary-ink hover:underline"
            >
              Lihat laporan
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <SalesChart data={data.chart} />
        </div>

        <div className="rounded-2xl border border-line bg-surface p-6 shadow-card">
          <h2 className="text-base font-semibold">Aksi Cepat</h2>
          <p className="mb-4 text-xs text-muted-foreground">Tiga cara mencatat transaksi</p>
          <QuickActionsMini />
        </div>
      </section>

      {/* Produk terlaris + transaksi terbaru */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-line bg-surface p-6 shadow-card">
          <h2 className="text-base font-semibold">Produk Terlaris</h2>
          <p className="mb-4 text-xs text-muted-foreground">Berdasarkan jumlah terjual bulan ini</p>
          <TopProducts products={data.topProducts} />
        </div>

        <div className="rounded-2xl border border-line bg-surface p-6 shadow-card lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold">Transaksi Terbaru</h2>
              <p className="text-xs text-muted-foreground">6 aktivitas terakhir</p>
            </div>
            <Link
              href="/transaksi"
              className="inline-flex items-center gap-1 text-sm font-medium text-primary-ink hover:underline"
            >
              Lihat semua
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <RecentTransactions transactions={data.recentTransactions} />
        </div>
      </section>

      {/* Insight otomatis dari data nyata */}
      <section aria-label="Ringkasan bisnis otomatis">
        <AiInsightCard
          headline={insight.headline}
          bullets={insight.bullets}
          badge="Otomatis · dari data transaksimu"
          note="Ringkasan dihitung langsung dari data transaksi (rule-based). Analisis AI penuh (LLM) aktif di Tahap 7."
        />
      </section>
    </div>
  );
}

/** Label hari ini: "Jumat, 30 Oktober 2026" (kalender Jakarta) */
function dayLabelNow(): string {
  const now = new Date();
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(now);
}

/** Baris mentah bulan berjalan untuk engine insight */
async function fetchMonthRows(supabase: Awaited<ReturnType<typeof createClient>>, businessId: string) {
  const monthISO = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
  const { data } = await supabase
    .from("transactions")
    .select("type, title, quantity, total, transacted_at")
    .eq("business_id", businessId)
    .gte("transacted_at", new Date(`${monthISO}-01T00:00:00+07:00`).toISOString());
  return data ?? [];
}

/** Kartu ajakan transaksi pertama (hanya tampil saat benar-benar kosong) */
function FirstTransactionCard() {
  const steps = [
    {
      href: "/assistant",
      icon: Bot,
      title: "Catat via AI Chat",
      desc: "Tulis bahasa biasa, AI yang rapikan.",
    },
    {
      href: "/assistant/nota",
      icon: Camera,
      title: "Upload Foto Nota",
      desc: "AI membaca nota belanjamu.",
    },
    {
      href: "/transaksi/baru",
      icon: CirclePlus,
      title: "Input Manual",
      desc: "Formulir cepat, tanpa AI.",
    },
  ];

  return (
    <div className="rounded-2xl border border-primary/25 bg-primary/5 p-6">
      <h2 className="text-base font-semibold">Mulai catat transaksi pertamamu</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Dashboard ini menampilkan angka Rp 0 karena memang belum ada data — bukan data palsu.
        Pilih salah satu cara di bawah:
      </p>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {steps.map((step) => (
          <Link
            key={step.href}
            href={step.href}
            className="group flex items-center gap-3 rounded-xl border border-line bg-surface p-3.5 transition-all hover:-translate-y-0.5 hover:shadow-card"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary-ink">
              <step.icon className="h-4 w-4" strokeWidth={2.2} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">{step.title}</span>
              <span className="block truncate text-xs text-muted-foreground">{step.desc}</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </Link>
        ))}
      </div>
    </div>
  );
}

/** Aksi cepat versi ringkas untuk kartu samping */
function QuickActionsMini() {
  const items = [
    { icon: Bot, title: "Catat via AI Chat", desc: "Bahasa sehari-hari.", href: "/assistant", featured: true },
    { icon: Camera, title: "Upload Foto Nota", desc: "AI baca & isi form.", href: "/assistant/nota", featured: false },
    { icon: CirclePlus, title: "Input Manual", desc: "Isi formulir sendiri.", href: "/transaksi/baru", featured: false },
  ];
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-1">
      {items.map((action) => (
        <Link
          key={action.href}
          href={action.href}
          className="group flex items-center gap-3.5 rounded-2xl border p-4 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-lift border-line bg-surface"
        >
          <span
            className={
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl " +
              (action.featured ? "bg-primary text-white" : "bg-primary/10 text-primary-ink")
            }
          >
            <action.icon className="h-5 w-5" strokeWidth={2.2} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-foreground">{action.title}</span>
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">{action.desc}</span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </Link>
      ))}
    </div>
  );
}
