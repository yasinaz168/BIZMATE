/** Cek apakah Supabase sudah dikonfigurasi via environment variables.
 * Dipakai agar aplikasi tidak crash ketika .env.local belum ada —
 * halaman akan menampilkan petunjuk konfigurasi (SetupNotice) saja.
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}
