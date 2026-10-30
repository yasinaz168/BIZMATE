import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { SetupNotice } from "@/components/setup-notice";
import { AuthShell } from "@/components/auth/auth-shell";
import { OnboardingForm } from "./onboarding-form";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata = { title: "Pengaturan Bisnismu" };
// memakai session/cookies → dynamic
export const dynamic = "force-dynamic";

/**
 * ONBOARDING — langkah pertama setelah register.
 * Menyiapkan profil bisnis dengan data asli pengguna.
 *
 * Gate:
 * - Belum login? → /login (lewat middleware).
 * - Sudah punya bisnis? → /dashboard (tidak boleh buat dua kali).
 */
export default async function OnboardingPage() {
  if (!isSupabaseConfigured()) {
    return <SetupNotice />;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Sudah punya bisnis → langsung ke dashboard
  const { data: existingBusiness } = await supabase
    .from("businesses")
    .select("id")
    .eq("owner_id", user.id)
    .maybeSingle();

  if (existingBusiness) {
    redirect("/dashboard");
  }

  // Prefill nama pemilik (dibawa dari form register bila tersedia)
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();

  const defaultName =
    profile?.full_name ||
    (user.user_metadata?.full_name as string | undefined) ||
    "";

  return (
    <AuthShell
      title="Siapkan Bisnismu"
      subtitle="Satu menit saja — supaya laporan dan AI Assistant bekerja dari data yang benar."
      footer={
        <p className="text-xs">
          Butuh bantuan?{" "}
          <a href="mailto:hello@bizmate.id" className="font-semibold text-primary-ink hover:underline">
            hello@bizmate.id
          </a>
        </p>
      }
    >
      <OnboardingForm defaultName={defaultName} />
    </AuthShell>
  );
}
