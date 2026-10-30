import Link from "next/link";
import { ShieldCheck, Zap, BarChart3 } from "lucide-react";
import { Logo } from "@/components/logo";

/**
 * Shell halaman auth: panel brand di kiri (desktop) + area form di kanan.
 * Di mobile, panel brand disembunyikan agar form langsung terlihat.
 */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-2">
      {/* Panel brand */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-primary-deep p-10 text-white lg:flex">
        <div aria-hidden="true" className="absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-primary/25 blur-3xl" />
        <Link href="/" aria-label="Kembali ke beranda BIZMATE">
          <Logo variant="light" />
        </Link>

        <div className="relative max-w-md">
          <h2 className="text-3xl font-extrabold leading-tight tracking-tight">
            Run Your Business.
            <br />
            Let AI Handle the Rest.
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-white/60">
            Asisten bisnis AI yang membantu UMKM Indonesia mencatat transaksi,
            memahami penjualan, dan mengambil keputusan dengan lebih percaya diri.
          </p>

          <ul className="mt-8 space-y-4">
            <Benefit icon={Zap} text="Catat transaksi lewat chat — tanpa ribet" />
            <Benefit icon={BarChart3} text="Laporan penjualan yang mudah dipahami" />
            <Benefit icon={ShieldCheck} text="Datamu aman dan hanya milikmu" />
          </ul>
        </div>

        <p className="relative text-xs text-white/60">© {new Date().getFullYear()} BIZMATE</p>
      </div>

      {/* Area form */}
      <main className="flex flex-col">
        <div className="flex items-center justify-between p-5 lg:hidden">
          <Link href="/" aria-label="Kembali ke beranda BIZMATE">
            <Logo variant="dark" />
          </Link>
        </div>

        <div className="flex flex-1 items-center justify-center px-5 pb-10 pt-4 sm:px-8">
          <div className="w-full max-w-md">
            {/* Panel brand mini untuk tablet */}
            <div className="mb-8 hidden sm:block lg:hidden">
              <h2 className="text-2xl font-extrabold tracking-tight">
                Run Your Business.
                <br />
                Let AI Handle the Rest.
              </h2>
            </div>

            <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>

            <div className="mt-7">{children}</div>

            <div className="mt-6 text-sm text-muted-foreground">{footer}</div>
          </div>
        </div>
      </main>
    </div>
  );
}

function Benefit({ icon: Icon, text }: { icon: React.ComponentType<{ className?: string }>; text: string }) {
  return (
    <li className="flex items-center gap-3 text-sm text-white/80">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/20 text-primary-bright ring-1 ring-inset ring-white/10">
        <Icon className="h-4 w-4" />
      </span>
      {text}
    </li>
  );
}
