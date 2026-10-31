import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseConfig } from "./config";

/**
 * Supabase client untuk BROWSER (aman — hanya publishable/anon key).
 * URL & key diambil dari environment variables, tidak pernah
 * ditulis di source code.
 */
export function createClient() {
  const config = getSupabaseConfig();
  if (!config) {
    throw new Error(
      "Supabase belum dikonfigurasi. Isi NEXT_PUBLIC_SUPABASE_URL dan NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY di .env.local"
    );
  }
  return createBrowserClient(config.url, config.key);
}
