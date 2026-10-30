import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { AuthForm } from "@/components/auth/auth-form";
import { SetupNotice } from "@/components/setup-notice";
import { isSupabaseConfigured } from "@/lib/supabase/config";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export const metadata = { title: "Masuk" };

function getParam(params: Record<string, string | string[] | undefined>, key: string): string | undefined {
  const value = params[key];
  if (typeof value !== "string") return undefined;
  // hanya path internal
  return value.startsWith("/") && !value.startsWith("//") ? value : undefined;
}

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  // origin & error parameter (mis. gagal verifikasi email)
  const error = getParam(params, "error");
  const nextPath = getParam(params, "next") ?? "/dashboard";

  if (!isSupabaseConfigured()) {
    return <SetupNotice />;
  }

  return (
    <AuthShell
      title="Masuk ke BIZMATE"
      subtitle="Lanjutkan kelola bisnismu dengan asisten AI."
      footer={
        <p>
          Belum punya akun?{" "}
          <Link href="/register" className="font-semibold text-primary-ink hover:underline">
            Daftar gratis
          </Link>
        </p>
      }
    >
      {error && (
        <div className="mb-4 rounded-xl border border-expense/20 bg-expense/5 px-4 py-3 text-sm text-expense">
          Verifikasi email tidak berhasil. Coba masuk manual dengan email &amp; kata sandimu.
        </div>
      )}
      <AuthForm mode="login" nextPath={nextPath} />
    </AuthShell>
  );
}
