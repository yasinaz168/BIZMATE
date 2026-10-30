import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { AuthForm } from "@/components/auth/auth-form";
import { SetupNotice } from "@/components/setup-notice";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata = { title: "Daftar" };

export default function RegisterPage() {
  if (!isSupabaseConfigured()) {
    return <SetupNotice />;
  }

  return (
    <AuthShell
      title="Buat Akun BIZMATE"
      subtitle="Gratis untuk memulai. Setelah daftar, kamu langsung diarahkan ke onboarding bisnis."
      footer={
        <p>
          Sudah punya akun?{" "}
          <Link href="/login" className="font-semibold text-primary-ink hover:underline">
            Masuk
          </Link>
        </p>
      }
    >
      <AuthForm mode="register" />
    </AuthShell>
  );
}
