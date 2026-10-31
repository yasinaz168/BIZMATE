import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { getSupabaseConfig } from "./config";

/**
 * Supabase client untuk SERVER (server components, server actions,
 * route handlers). Session dibaca dari cookies — jika cookies hilang
 * sudah pasti di-refresh oleh middleware.ts
 */
export async function createClient() {
  const config = getSupabaseConfig();
  if (!config) {
    throw new Error(
      "Supabase belum dikonfigurasi. Isi NEXT_PUBLIC_SUPABASE_URL dan NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY di .env.local"
    );
  }

  const cookieStore = await cookies();

  return createServerClient(config.url, config.key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Dipanggil dari Server Component — aman diabaikan karena
          // middleware yang melakukan refresh session.
        }
      },
    },
  });
}
