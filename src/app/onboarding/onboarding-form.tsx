"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { BusinessCategories } from "@/lib/constants";
import {
  saveBusinessAction,
  type OnboardingFormState,
} from "@/app/onboarding/actions";

/**
 * Form onboarding — simpan profil bisnis di awal.
 * Field wajib: nama pemilik, nama bisnis, kategori.
 */
export function OnboardingForm({ defaultName }: { defaultName: string }) {
  const [state, formAction, pending] = useActionState<OnboardingFormState | null, FormData>(
    saveBusinessAction,
    null
  );

  return (
    <form className="space-y-4" action={formAction}>
      <div className="space-y-1.5">
        <Label htmlFor="full_name">Nama Pemilik</Label>
        <Input
          id="full_name"
          name="full_name"
          type="text"
          defaultValue={defaultName}
          placeholder="Nama lengkap kamu"
          required
          disabled={pending}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="business_name">Nama Bisnis</Label>
        <Input
          id="business_name"
          name="business_name"
          type="text"
          placeholder="Contoh: Kedai Kopi Senja"
          required
          disabled={pending}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="category">Kategori Bisnis</Label>
          <Select id="category" name="category" required disabled={pending} defaultValue="">
            <option value="" disabled>
              Pilih kategori
            </option>
            {BusinessCategories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="phone">Nomor Telepon (opsional)</Label>
          <Input
            id="phone"
            name="phone"
            type="tel"
            placeholder="08xx-xxxx-xxxx"
            disabled={pending}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="product_type">Jenis Produk atau Layanan</Label>
        <Input
          id="product_type"
          name="product_type"
          type="text"
          placeholder="Contoh: kopi, jahit baju, jasa curhat"
          disabled={pending}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">Deskripsi Bisnis (opsional)</Label>
        <Textarea
          id="description"
          name="description"
          placeholder="Tuliskan bisnismu singkat saja — 1–2 kalimat."
          disabled={pending}
        />
      </div>

      {state?.error && (
        <div role="alert" className="rounded-xl border border-expense/20 bg-expense/5 px-4 py-3 text-sm text-expense">
          {state.error}
        </div>
      )}

      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Simpan &amp; Buka Dashboard
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        Data ini bisa diubah kapan saja di halaman Pengaturan.
      </p>
    </form>
  );
}
