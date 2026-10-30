import {
  Bot,
  ScanLine,
  NotebookPen,
  LayoutDashboard,
  Lightbulb,
  FileText,
  ArrowRight,
} from "lucide-react";
import { SectionHeading } from "@/components/landing/section-heading";
import { buttonVariants } from "@/components/ui/button";
import Link from "next/link";

/**
 * Features Section dengan HIERARKI JELAS — bukan grid 6 kartu seragam:
 * 1. Kartu unggulan (AI Chat Transaction) diangkat sebagai fitur inti BIZMATE
 *    dengan panel gelap + contoh percakapan nyata.
 * 2. AI Receipt Scanner dengan aksen brand.
 * 3. Empat fitur pendukung dalam grid seragam yang tetap tenang.
 */
export function FeaturesSection() {
  return (
    <section className="py-16 lg:py-24" id="fitur">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="Fitur"
          title="Semua yang butuh, tanpa yang tidak butuh."
          subtitle="BIZMATE fokus pada satu tujuan: mencatat dan memahami bisnis dengan minim usaha. Tidak ada fitur berlebihan yang tidak kamu pakai."
        />

        <div className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {/* ——— FITUR UNGGULAN: AI Chat Transaction ——— */}
          <article className="relative overflow-hidden rounded-2xl bg-primary-deep p-6 text-white shadow-lift sm:col-span-2">
            <div
              aria-hidden="true"
              className="absolute -bottom-20 -right-20 h-56 w-56 rounded-full bg-primary/25 blur-3xl"
            />
            <div className="relative grid grid-cols-1 gap-6 md:grid-cols-2">
              <div>
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-white">
                  <Bot className="h-5 w-5" strokeWidth={2.2} />
                </span>
                <span className="mt-4 flex w-fit items-center gap-1.5 rounded-full bg-black/20 px-2.5 py-0.5 text-[11px] font-semibold text-primary-bright">
                  Fitur Inti
                </span>
                <h3 className="mt-2 text-lg font-bold">AI Chat Transaction</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/70">
                  Ketik transaksi seperti ngobrol biasa. AI mengubahnya langsung
                  menjadi catatan yang rapi — lengkap dengan total yang dihitung sendiri.
                </p>
              </div>

              {/* Contoh percakapan (ilustrasi alur, bukan fitur langsung) */}
              <div className="flex flex-col justify-center gap-2.5">
                <div className="self-start rounded-xl rounded-bl-sm bg-white/10 px-3.5 py-2.5 text-[13px] leading-snug text-white/90">
                  Hari ini saya menjual 3 kaos dengan harga 75 ribu per buah.
                </div>
                <div className="self-end rounded-xl rounded-br-sm border border-primary/40 bg-primary/15 px-3.5 py-2.5 text-[13px] leading-snug">
                  <span className="mb-1.5 flex items-center gap-1.5 font-semibold text-primary-bright">
                    <Bot className="h-3.5 w-3.5" />
                    Preview transaksi
                  </span>
                  <span className="flex flex-wrap gap-1.5 text-white/80">
                    <span className="rounded bg-white/10 px-1.5 py-0.5">Kaos</span>
                    <span className="rounded bg-white/10 px-1.5 py-0.5">3 buah</span>
                    <span className="rounded bg-white/10 px-1.5 py-0.5">Rp 75.000/pc</span>
                  </span>
                  <span className="mt-1.5 block font-bold">Total: Rp 225.000</span>
                </div>
              </div>
            </div>
          </article>

          {/* ——— AI Receipt Scanner dengan aksen brand ——— */}
          <article className="rounded-2xl border border-primary/25 bg-primary/5 p-6 shadow-card transition-all hover:-translate-y-1 hover:shadow-lift">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary-ink">
              <ScanLine className="h-5 w-5" strokeWidth={2.2} />
            </span>
            <h3 className="mt-5 text-base font-semibold text-foreground">AI Receipt Scanner</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Foto nota belanja, AI membacanya dan mengisi formulir transaksi.
              Kamu tinggal cek dan simpan.
            </p>
          </article>

          {/* ——— Empat fitur pendukung ——— */}
          {SUPPORT_FEATURES.map((feature) => (
            <article
              key={feature.title}
              className="group rounded-2xl border border-line bg-surface p-6 shadow-card transition-all hover:-translate-y-1 hover:border-primary/30 hover:shadow-lift"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary-ink transition-colors group-hover:bg-primary group-hover:text-white">
                <feature.icon className="h-5 w-5" strokeWidth={2.2} />
              </span>
              <h3 className="mt-5 text-base font-semibold text-foreground">{feature.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{feature.text}</p>
            </article>
          ))}
        </div>

        {/* CTA kecil di bawah fitur */}
        <div className="mt-12 text-center">
          <Link href="/register" className={buttonVariants({ size: "lg" })}>
            Coba BIZMATE Sekarang
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

const SUPPORT_FEATURES = [
  {
    icon: NotebookPen,
    title: "Manual Transaction",
    text: "Form input manual yang cepat untuk transaksi apa pun — pemasukan maupun pengeluaran.",
  },
  {
    icon: LayoutDashboard,
    title: "Sales Dashboard",
    text: "Angka penjualan hari ini, bulan ini, produk terlaris, dan transaksi terbaru — semua dalam satu halaman.",
  },
  {
    icon: Lightbulb,
    title: "AI Business Insights",
    text: "AI membaca datamu dan menjelaskan dalam bahasa manusia: apa yang naik, apa yang perlu diperhatikan.",
  },
  {
    icon: FileText,
    title: "Sales Reports",
    text: "Laporan harian, mingguan, bulanan lengkap dengan grafik dan export CSV untuk pembukuan.",
  },
];

