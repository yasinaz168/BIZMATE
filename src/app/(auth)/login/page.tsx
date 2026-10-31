import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { AuthForm } from "@/components/auth/auth-form";
import { SetupNotice } from "@/components/setup-notice";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { safeInternalPath } from "@/lib/utils";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export const metadata = { title: "Masuk" };

/**
 * Token penanda dari /auth/callback (mis. "auth") — BUKAN path.
 * Dulu ikut divalidasi sebagai path (harus diawali "/"), sehingga banner
 * verifikasi email tidak pernah tampil (temuan audit ISS-2).
 */
const ERROR_TOKEN_RE = /^[a-z0-9_-]{1,40}$/i;

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  // "error" = penanda gagal verifikasi email; "next" = tujuan setelah login
  const errorToken = typeof params.error === "string" ? params.error : undefined;
  const hasAuthError = Boolean(errorToken && ERROR_TOKEN_RE.test(errorToken));
  // "next" hanya menerima path internal yang aman (proteksi open redirect, ISS-1)
  const nextPath = safeInternalPath(params.next, "/dashboard");

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
      {hasAuthError && (
        <div className="mb-4 rounded-xl border border-expense/20 bg-expense/5 px-4 py-3 text-sm text-expense">
          Verifikasi email tidak berhasil. Coba masuk manual dengan email &amp; kata sandimu.
        </div>
      )}
      <AuthForm mode="login" nextPath={nextPath} />
    </AuthShell>
  );
}
