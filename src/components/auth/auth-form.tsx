"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { CircleAlert, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Formulir auth TAHAP 1:
 * - Input bisa diketik normal (validasi HTML dasar saja).
 * - Tombol submit SENGAJA nonaktif dengan pesan jujur:
 *   autentikasi Supabase diaktifkan di TAHAP 2.
 * - Di Tahap 2, tombol ini diaktifkan dan memanggil Supabase Auth.
 */
export function AuthForm({
  mode,
}: {
  mode: "login" | "register";
}) {
  const isRegister = mode === "register";
  const [submitting, setSubmitting] = useState(false);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    // TAHAP 2: panggil Supabase Auth di sini.
    setSubmitting(false);
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit} noValidate>
      {isRegister && (
        <Field label="Nama Lengkap" htmlFor="name">
          <Input id="name" name="name" type="text" autoComplete="name" placeholder="Nama kamu" required />
        </Field>
      )}

      <Field label="Email" htmlFor="email">
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="nama@contoh.com"
          required
        />
      </Field>

      <Field label="Kata Sandi" htmlFor="password">
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete={isRegister ? "new-password" : "current-password"}
          placeholder="Minimal 8 karakter"
          required
          minLength={8}
        />
      </Field>

      {isRegister && (
        <Field label="Konfirmasi Kata Sandi" htmlFor="confirm-password">
          <Input
            id="confirm-password"
            name="confirm-password"
            type="password"
            autoComplete="new-password"
            placeholder="Ulangi kata sandi"
            required
            minLength={8}
          />
        </Field>
      )}

      {/* Status jujur: autentikasi belum aktif */}
      <div
        role="status"
        className="flex items-start gap-2.5 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-xs leading-relaxed text-orange-800"
      >
        <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
        <span>
          <strong>Formulir belum aktif.</strong> Autentikasi (Supabase) akan terhubung di{" "}
          <strong>Tahap 2</strong>. Coba login tampilannya sekarang — tulis saja nanti.
        </span>
      </div>

      <Button type="submit" variant="outline" size="lg" disabled className="w-full">
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {isRegister ? "Buat Akun" : "Masuk"}
      </Button>

      {!isRegister && (
        <p className="text-center text-sm text-muted-foreground">
          Belum punya akun?{" "}
          <Link href="/register" className="font-semibold text-primary hover:underline">
            Daftar di sini
          </Link>
        </p>
      )}
    </form>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}
