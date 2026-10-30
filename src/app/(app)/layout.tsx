import { redirect } from "next/navigation";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppHeader } from "@/components/layout/app-header";
import { SetupNotice } from "@/components/setup-notice";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * Layout halaman aplikasi — TERLINDUNGI & selalu dynamic (memakai
 * cookies/session, tidak boleh di-prerender).
 *
 * Chain keamanan:
 * 1. middleware.ts  → pengguna belum login dibuang ke /login.
 * 2. Layout ini     → cek ulang session di server + harus punya business,
 *                     kalau belum → /onboarding.
 * 3. RLS Supabase   → query apapun hanya melihat baris milik user ini.
 */
export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  if (!isSupabaseConfigured()) {
    return <SetupNotice />;
  }

  const supabase = await createClient();

  // getUser() memvalidasi token ke server Supabase (bukan sekadar cookie)
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Business profile wajib sudah dibuat di onboarding
  const { data: business } = await supabase
    .from("businesses")
    .select("id, name, category")
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!business) {
    redirect("/onboarding");
  }

  return (
    <div className="min-h-screen">
      <AppSidebar businessName={business.name} />
      <div className="flex min-h-screen flex-col lg:pl-[260px]">
        <AppHeader businessName={business.name} />
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
