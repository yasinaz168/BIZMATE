import {
  Bot,
  ScanLine,
  NotebookPen,
  LayoutDashboard,
  Lightbulb,
  FileText,
} from "lucide-react";
import { SectionHeading } from "@/components/landing/section-heading";
import { buttonVariants } from "@/components/ui/button";
import Link from "next/link";

const FEATURES = [
  {
    icon: Bot,
    title: "AI Chat Transaction",
    text: "Ketik transaksi seperti chat biasa: \"Menjual 3 kaos harga 75rb\". AI mengubahnya langsung menjadi catatan rapi.",
  },
  {
    icon: ScanLine,
    title: "AI Receipt Scanner",
    text: "Foto nota belanja, AI membacanya dan mengisi formulir transaksi. Kamu tinggal cek dan simpan.",
  },
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

/** Features Section: 6 fitur inti BIZMATE. */
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
          {FEATURES.map((feature) => (
            <article
              key={feature.title}
              className="group rounded-2xl border border-line bg-surface p-6 shadow-card transition-all hover:-translate-y-1 hover:border-primary/30 hover:shadow-lift"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-white">
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
          </Link>
        </div>
      </div>
    </section>
  );
}
