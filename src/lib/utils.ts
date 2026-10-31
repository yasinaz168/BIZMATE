import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Menggabungkan class Tailwind dengan rapi.
 * Dipakai di semua komponen UI (pola shadcn/ui).
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Validasi path tujuan redirect (parameter "next") — hanya mengizinkan
 * path internal yang aman. Menutup temuan audit ISS-1 (open redirect).
 *
 * Pemeriksaan lama `startsWith("/") && !startsWith("//")` masih bisa
 * ditembus oleh backslash: `/\evil.com` dinormalkan browser menjadi
 * `//evil.com` (URL protokol-relatif) sehingga pengguna bisa dialihkan
 * ke domain eksternal. Teknik serupa memakai percent-encoding
 * (%5c, %2f) dan karakter kontrol untuk membelah header Location.
 */
export function isSafeInternalPath(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (value.length === 0 || value.length > 512) return false;

  // Wajib path absolut internal: diawali satu "/", bukan "//" (protokol-relatif)
  if (!value.startsWith("/") || value.startsWith("//")) return false;

  // Whitelist karakter: huruf/angka + pemisah path/query yang aman.
  // Backslash, spasi, karakter kontrol, dan karakter aneh lain
  // otomatis tertolak karena tidak ada dalam daftar.
  if (!/^\/[A-Za-z0-9/_\-.~?=&%#]*$/.test(value)) return false;

  // Percent-encoding yang bisa dinormalkan browser menjadi
  // pemisah ("/") atau karakter kontrol (CR/LF/NUL) ditolak.
  if (/%(5c|2f|0d|0a|09|00)/i.test(value)) return false;

  return true;
}

/** Fallback konstan yang aman — dipakai bila parameter fallback
 *  ternyata tidak lolos validasi path internal. */
const SAFE_FALLBACK_PATH = "/dashboard";

/**
 * Kembalikan path hanya bila aman sebagai redirect internal;
 * selain itu gunakan fallback.
 *
 * Parameter fallback IKUT divalidasi lewat isSafeInternalPath — jika
 * fallback tidak aman (mis. keliru diisi URL luar atau payload
 * backslash), dipakai fallback konstan yang aman ("/dashboard").
 * Dengan begitu fungsi ini mustahil menghasilkan redirect ke domain
 * eksternal, sekalipun dipanggil dengan argumen yang salah.
 */
export function safeInternalPath(value: unknown, fallback: unknown): string {
  if (isSafeInternalPath(value)) return value;
  if (isSafeInternalPath(fallback)) return fallback;
  return SAFE_FALLBACK_PATH;
}
