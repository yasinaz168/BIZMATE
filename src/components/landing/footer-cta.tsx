import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

/** CTA Section: ajakan mencoba BIZMATE. */
export function CtaSection() {
  return (
    <section className="py-16 lg:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-3xl border border-primary-deep/60 bg-primary-deep px-6 py-14 text-center shadow-lift sm:px-16">
          {/* Aksen dekoratif */}
          <div aria-hidden="true" className="absolute -left-20 -top-20 h-64 w-64 rounded-full bg-primary/25 blur-3xl" />
          <div aria-hidden="true" className="absolute -bottom-24 -right-16 h-64 w-64 rounded-full bg-primary/20 blur-3xl" />

          <div className="relative mx-auto max-w-2xl">
            <h2 className="text-3xl font-extrabold tracking-tight text-white lg:text-4xl">
              Waktunya bisnismu diatur rapi — tanpa kerja ekstra.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-white/60">
              Mulai gratis hari ini. Catat transaksi pertamamu dalam waktu kurang
              dari dua menit, dan biarkan AI yang mengurus sisanya.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href="/register" className={buttonVariants({ size: "lg" })}>
                Mulai Gratis Sekarang
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/login"
                className="text-sm font-semibold text-white/70 transition-colors hover:text-white"
              >
                Sudah punya akun? Masuk →
              </Link>
            </div>
            <p className="mt-6 text-xs text-white/60">
              Gratis untuk memulai · Data aman · Bahasa Indonesia
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
