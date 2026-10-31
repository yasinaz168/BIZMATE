/**
 * Konfigurasi Supabase dari environment variables.
 *
 * Nama utama : NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (sesuai dashboard Supabase)
 * Fallback   : NEXT_PUBLIC_SUPABASE_ANON_KEY (nama lama, tetap didukung)
 *
 * Kedua nama sengaja ditulis statis sebagai process.env.NEXT_PUBLIC_...
 * agar Next.js dapat meng-inline nilainya ke bundle browser.
 * Jangan diganti dengan akses dinamis seperti process.env[namaVariabel].
 */
export function getSupabaseConfig(): { url: string; key: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) return null;

  return { url, key };
}

/** Cek apakah Supabase sudah dikonfigurasi via environment variables.
 * Dipakai agar aplikasi tidak crash ketika .env.local belum ada —
 * halaman akan menampilkan petunjuk konfigurasi (SetupNotice) saja.
 */
export function isSupabaseConfigured(): boolean {
  return getSupabaseConfig() !== null;
}
