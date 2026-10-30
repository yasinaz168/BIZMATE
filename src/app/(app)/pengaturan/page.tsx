import { redirect } from "next/navigation";
import { LogOut, ShieldCheck, Clock, Coins } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { signOutAction } from "@/app/(auth)/actions";
import { createClient } from "@/lib/supabase/server";
import { BusinessProfileForm } from "./business-profile-form";

export const metadata = { title: "Pengaturan" };

/**
 * PENGATURAN — profil bisnis nyata (database), bukan placeholder.
 * Menampilkan akun & preferensi, dan tombol keluar yang fungsional.
 */
export default async function PengaturanPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [businessRes, profileRes] = await Promise.all([
    supabase.from("businesses").select("*").eq("owner_id", user.id).maybeSingle(),
    supabase.from("profiles").select("full_name, phone").eq("id", user.id).maybeSingle(),
  ]);

  if (!businessRes.data) redirect("/onboarding");
  const business = businessRes.data;
  const profile = profileRes.data;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* Form profil bisnis */}
      <div className="lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>Profil Bisnis</CardTitle>
            <CardDescription>
              Data ini dipakai di dashboard, laporan, dan sebagai konteks untuk AI Assistant.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BusinessProfileForm
              name={business.name}
              category={business.category}
              description={business.description ?? ""}
              productType={business.product_type ?? ""}
              phone={business.phone ?? ""}
            />
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Akun</CardTitle>
            <CardDescription>Identitas login kamu.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3 text-sm">
              <div className="flex flex-wrap justify-between gap-2 rounded-xl bg-muted/60 px-4 py-3">
                <dt className="text-muted-foreground">Nama pemilik</dt>
                <dd className="font-medium">{profile?.full_name || "—"}</dd>
              </div>
              <div className="flex flex-wrap justify-between gap-2 rounded-xl bg-muted/60 px-4 py-3">
                <dt className="text-muted-foreground">Email</dt>
                <dd className="font-medium">{user.email}</dd>
              </div>
            </dl>

            {/* Tombol keluar: server action nyata */}
            <form action={signOutAction} className="mt-5">
              <button
                type="submit"
                className="inline-flex h-11 items-center gap-2 rounded-lg border border-expense/30 bg-surface px-4 text-sm font-semibold text-expense transition-colors hover:bg-expense/5"
              >
                <LogOut className="h-4 w-4" />
                Keluar dari BIZMATE
              </button>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Kolom samping: info standar */}
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Preferensi Standar</CardTitle>
            <CardDescription>Nilai default aplikasi untuk semua akun.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center gap-3 rounded-xl bg-muted/60 px-4 py-3">
              <Clock className="h-4 w-4 shrink-0 text-primary-ink" />
              <div>
                <p className="font-medium">Zona waktu</p>
                <p className="text-xs text-muted-foreground">Asia/Jakarta (WIB)</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl bg-muted/60 px-4 py-3">
              <Coins className="h-4 w-4 shrink-0 text-primary-ink" />
              <div>
                <p className="font-medium">Mata uang</p>
                <p className="text-xs text-muted-foreground">Rupiah (IDR)</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Keamanan Data</CardTitle>
            <CardDescription>Bagaimana datamu dilindungi.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary-ink" />
              <p className="leading-relaxed text-muted-foreground">
                Row Level Security aktif di database: baris data bisnismu hanya bisa
                dibaca dan diubah oleh akunmu — di tingkat database, bukan di aplikasi.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
