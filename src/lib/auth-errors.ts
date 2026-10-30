/**
 * Terjemahan pesan error Supabase Auth ke Bahasa Indonesia yang ramah.
 * Pesan asli Supabase sering teknis / berbahasa Inggris.
 */
const AUTH_ERROR_ID: Record<string, string> = {
  invalid_credentials: "Email atau kata sandi salah.",
  user_not_found: "Akun tidak ditemukan.",
  user_banned: "Akun ini dinonaktifkan.",
  email_not_confirmed: "Email belum diverifikasi. Cek kotak masuk emailmu.",
  over_email_send_rate_limit: "Terlalu sering mencoba. Tunggu beberapa saat lagi.",
  user_already_exists: "Email ini sudah terdaftar. Coba masuk atau pakai email lain.",
  weak_password: "Kata sandi terlalu lemah. Gunakan minimal 8 karakter.",
  validation_failed: "Format email tidak valid.",
};

// Fallback untuk pesan asli yang ditampilkan sebagai plain text
const AUTH_ERROR_TEXT: Record<string, string> = {
  "invalid login credentials": "Email atau kata sandi salah.",
  "email not confirmed": "Email belum diverifikasi. Cek kotak masuk emailmu.",
  "user already registered": "Email ini sudah terdaftar. Coba masuk.",
  "signups not allowed for this instance": "Pendaftaran sedang ditutup. Hubungi admin.",
  "password should be at least 8 characters": "Kata sandi minimal 8 karakter.",
};

export function translateAuthError(message: string): string {
  if (AUTH_ERROR_ID[message]) return AUTH_ERROR_ID[message];

  const lower = message.toLowerCase();
  for (const [needle, translation] of Object.entries(AUTH_ERROR_TEXT)) {
    if (lower.includes(needle)) return translation;
  }
  return "Terjadi kesalahan. Coba lagi beberapa saat.";
}
