"use client";

import { useActionState } from "react";
import Link from "next/link";
import { CircleAlert, Loader2, CircleCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  signInAction,
  signUpAction,
  type AuthFormState,
} from "@/app/(auth)/actions";

/**
 * Formulir auth yang AKTIF — terhubung ke Supabase via server actions.
 * Validasi berlapis: HTML (browser) + validasi ulang di server action.
 */
export function AuthForm({
  mode,
  nextPath,
}: {
  mode: "login" | "register";
  nextPath?: string;
}) {
  const action = mode === "register" ? signUpAction : signInAction;
  const [state, formAction, pending] = useActionState<AuthFormState | null, FormData>(action, null);

  const isRegister = mode === "register";

  return (
    <form className="space-y-4" action={formAction} noValidate>
      {isRegister && (
        <Field label="Nama Lengkap" htmlFor="name">
          <Input
            id="name"
            name="name"
            type="text"
            autoComplete="name"
            placeholder="Nama kamu"
            required
            minLength={2}
            maxLength={80}
            disabled={pending}
          />
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
          disabled={pending}
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
          disabled={pending}
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
            disabled={pending}
          />
        </Field>
      )}

      {/* Path tujuan setelah login (diisi middleware saat redirect) */}
      {nextPath && <input type="hidden" name="next" value={nextPath} />}

      {/* Pesan error dari server */}
      {state?.error && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-xl border border-expense/20 bg-expense/5 px-4 py-3 text-sm leading-relaxed text-expense"
        >
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{state.error}</span>
        </div>
      )}

      {/* Pesan sukses (mis. cek email verifikasi) */}
      {state?.success && (
        <div
          role="status"
          className="flex items-start gap-2.5 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm leading-relaxed text-primary-ink"
        >
          <CircleCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{state.success}</span>
        </div>
      )}

      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {isRegister ? "Buat Akun" : "Masuk"}
      </Button>

      {!isRegister && (
        <p className="text-center text-sm text-muted-foreground">
          Belum punya akun?{" "}
          <Link href="/register" className="font-semibold text-primary-ink hover:underline">
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
