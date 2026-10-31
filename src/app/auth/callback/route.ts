import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { safeInternalPath } from "@/lib/utils";

/**
 * /auth/callback — tautan verifikasi email Supabase mengarah ke sini.
 * Kode dalam URL ditukar menjadi session, lalu pengguna diarahkan
 * ke halaman tujuan (default: onboarding).
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (!isSupabaseConfigured()) {
    return NextResponse.redirect(`${origin}/login`);
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Hanya terima path internal yang aman (proteksi open redirect, ISS-1)
      const target = safeInternalPath(searchParams.get("next"), "/onboarding");
      return NextResponse.redirect(`${origin}${target}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
