"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { translateAuthError } from "@/lib/auth-errors";
import { safeInternalPath } from "@/lib/utils";

function getOrigin(): string {
  const h = headers();
  const origin = h.get("origin");
  if (origin) return origin;
  const host = h.get("host");
  if (host) return `https://${host}`;
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

/**
 * Server actions untuk autentikasi.
 * - Semua validasi ulang di SERVER (jangan percai validasi browser saja).
 * - redirect() hanya diarahkan jika proses sukses.
 */

export type AuthFormState = {
  error?: string;
  success?: string;
};

/** Path tujuan setelah login. Selalu path internal yang aman ("/..."),
 *  bukan URL luar — memakai safeInternalPath (proteksi open redirect). */
function safeNextPath(raw: FormDataEntryValue | null): string {
  return safeInternalPath(raw, "/dashboard");
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function signUpAction(
  _prevState: AuthFormState | null,
  formData: FormData
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm-password") ?? "");
  const fullName = String(formData.get("name") ?? "").trim();

  // Validasi server-side — meskipun browser sudah memvalidasi
  if (fullName.length < 2) {
    return { error: "Nama lengkap minimal 2 karakter." };
  }
  if (!EMAIL_RE.test(email)) {
    return { error: "Format email tidak valid." };
  }
  if (password.length < 8) {
    return { error: "Kata sandi minimal 8 karakter." };
  }
  if (password !== confirm) {
    return { error: "Konfirmasi kata sandi tidak sama." };
  }

  const supabase = await createClient();
  const origin = getOrigin();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
      // Supabase memerlukan redirect URL absolut yang terdaftar di URL Configuration
      emailRedirectTo: `${origin}/auth/callback?next=/onboarding`,
    },
  });

  if (error) {
    console.error("[signUpAction] Supabase error:", error.message, error.status);
    return { error: translateAuthError(error.message) };
  }

  // Email confirmation ON → tidak ada session; minta pengguna cek email
  if (!data.session) {
    return {
      success:
        "Hampir selesai! Kami mengirim email verifikasi. Buka emailnya, lalu masuk lagi di sini.",
    };
  }

  // Email confirmation OFF → langsung ke onboarding
  redirect("/onboarding");
}

export async function signInAction(
  _prevState: AuthFormState | null,
  formData: FormData
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!EMAIL_RE.test(email)) {
    return { error: "Format email tidak valid." };
  }
  if (!password) {
    return { error: "Kata sandi wajib diisi." };
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: translateAuthError(error.message) };
  }

  // redirect melempar NEXT_REDIRECT — target dihitung dari form
  redirect(safeNextPath(formData.get("next")));
}

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
