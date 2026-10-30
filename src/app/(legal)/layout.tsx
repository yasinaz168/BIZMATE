import { LandingNavbar } from "@/components/landing/navbar";
import { Footer } from "@/components/landing/footer";

/**
 * Layout untuk halaman legal (kebijakan privasi, ketentuan layanan).
 * Konten lengkap disiapkan sebelum rilis — sekarang masih kerangka.
 */
export default function LegalLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="bg-background">
      <LandingNavbar />
      <main className="mx-auto max-w-3xl px-4 pb-20 pt-28 sm:px-6 sm:pt-32">
        <article className="rounded-2xl border border-line bg-surface p-6 shadow-card sm:p-10">
          {children}
        </article>
      </main>
      <Footer />
    </div>
  );
}
