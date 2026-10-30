import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { AuthForm } from "@/components/auth/auth-form";

export const metadata = { title: "Masuk" };

export default function LoginPage() {
  return (
    <AuthShell
      title="Masuk ke BIZMATE"
      subtitle="Lanjutkan kelola bisnismu dengan asisten AI."
      footer={
        <p>
          Belum punya akun?{" "}
          <Link href="/register" className="font-semibold text-primary hover:underline">
            Daftar gratis
          </Link>
        </p>
      }
    >
      <AuthForm mode="login" />
    </AuthShell>
  );
}
