import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { DashboardPreview } from "@/components/landing/dashboard-preview";
import { ArrowRight, Check, Sparkles } from "lucide-react";

/** Hero: headline, subheadline, CTA, dan mockup dashboard. */
export function Hero() {
  return (
    <section id="beranda" className="relative overflow-hidden pb-16 pt-28 sm:pt-32 lg:pb-24 lg:pt-36">
      {/* Aksen latar halus */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[480px] bg-[radial-gradient(ellipse_at_top,rgba(8,127,115,0.08),transparent_60%)]"
      />

      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:gap-10 lg:px-8">
        <div className="animate-fade-up">
          <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-1.5 text-xs font-semibold text-primary shadow-card">
            <Sparkles className="h-3.5 w-3.5" />
            Untuk UMKM Indonesia
          </span>

          <h1 className="mt-5 text-4xl font-extrabold leading-[1.1] tracking-tight text-foreground sm:text-5xl lg:text-[3.4rem]">
            Kelola Bisnis Lebih Mudah{" "}
            <span className="text-primary">dengan AI.</span>
          </h1>

          <p className="mt-5 max-w-lg text-base leading-relaxed text-muted-foreground sm:text-lg">
            Catat transaksi, pantau penjualan, dan pahami perkembangan bisnismu
            dalam satu platform.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/register" className={buttonVariants({ size: "lg" })}>
              Mulai Sekarang
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="#fitur" className={buttonVariants({ variant: "outline", size: "lg" })}>
              Lihat Fitur
            </Link>
          </div>

          <p className="mt-6 flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Check className="h-3.5 w-3.5 text-primary" /> Gratis untuk memulai
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Check className="h-3.5 w-3.5 text-primary" /> Tanpa kartu kredit
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Check className="h-3.5 w-3.5 text-primary" /> Datamu milikmu
            </span>
          </p>
        </div>

        <div className="animate-fade-up [animation-delay:150ms]">
          <DashboardPreview />
        </div>
      </div>
    </section>
  );
}
