import { LayoutDashboard, CircleHelp, ExternalLink, Database } from "lucide-react";
import { Logo } from "@/components/logo";

/**
 * Panel yang muncul bila .env.local belum diisi.
 * Aplikasi TIDAK crash — hanya menampilkan panduan konfigurasi.
 */
export function SetupNotice() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-xl rounded-2xl border border-line bg-surface p-8 shadow-card">
        <Logo variant="dark" />
        <h1 className="mt-6 text-xl font-bold tracking-tight">Supabase belum dikonfigurasi</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Fitur ini butuh koneksi database. Ikuti 3 langkah berikut (± 5 menit):
        </p>

        <ol className="mt-6 space-y-4">
          <Step
            icon={ExternalLink}
            title="1. Buat project Supabase"
            text="Buka supabase.com → New Project. Simpan Project URL dan publishable key dari menu Project → Settings → API Keys."
          />
          <Step
            icon={Database}
            title="2. Jalankan SQL migration"
            text="Menu SQL Editor → paste isi supabase/migrations/00001_core_schema.sql → Run."
          />
          <Step
            icon={LayoutDashboard}
            title="3. Isi .env.local lalu restart dev server"
            text={
              'Copy .env.example menjadi .env.local, isi NEXT_PUBLIC_SUPABASE_URL dan NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, lalu jalankan "npm run dev" lagi. Daftarkan juga http://localhost:3000/auth/callback di Supabase → Authentication → URL Configuration → Redirect URLs.'
            }
          />
        </ol>

        <div className="mt-6 flex items-start gap-2.5 rounded-xl bg-muted p-4 text-xs leading-relaxed text-muted-foreground">
          <CircleHelp className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <span>
            Publishable key aman untuk browser dan bukan rahasia. Yang rahasia adalah secret
            key / service role key — key itu tidak boleh masuk ke aplikasi ini atau diekspos ke browser.
          </span>
        </div>
      </div>
    </div>
  );
}

function Step({
  icon: Icon,
  title,
  text,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  text: string;
}) {
  return (
    <li className="flex gap-3.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </span>
      <div>
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{text}</p>
      </div>
    </li>
  );
}
