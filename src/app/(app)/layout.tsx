import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppHeader } from "@/components/layout/app-header";
import { DemoBanner } from "@/components/layout/demo-banner";

/**
 * Layout untuk semua halaman dalam aplikasi (dashboard, transaksi, dll).
 *
 * CATATAN TAHAP 1:
 * - Autentikasi & protected routes masih diaktifkan di TAHAP 2.
 * - Saat itu terjadi, layout ini akan membungkus pengecekan session Supabase,
 *   dan pengguna tanpa sesi akan diarahkan ke /login.
 */
export default function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-screen">
      <AppSidebar />
      <div className="flex min-h-screen flex-col lg:pl-[260px]">
        <AppHeader />
        <DemoBanner />
        <main className="page-container flex-1 py-6 lg:py-8">{children}</main>
        <footer className="border-t border-line py-5">
          <p className="page-container text-center text-xs text-muted-foreground">
            © {new Date().getFullYear()} BIZMATE — Run Your Business. Let AI Handle the Rest.
          </p>
        </footer>
      </div>
    </div>
  );
}
