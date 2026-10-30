"use client";

import { useActionState } from "react";
import { CircleAlert, CircleCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { BusinessCategories } from "@/lib/constants";
import { updateBusinessAction, type SettingsFormState } from "@/app/(app)/pengaturan/actions";

interface BusinessFormProps {
  name: string;
  category: string;
  description: string;
  productType: string;
  phone: string;
}

export function BusinessProfileForm({ name, category, description, productType, phone }: BusinessFormProps) {
  const [state, formAction, pending] = useActionState<SettingsFormState | null, FormData>(
    updateBusinessAction,
    null
  );

  return (
    <form className="space-y-4" action={formAction}>
      <div className="space-y-1.5">
        <Label htmlFor="name">Nama Bisnis</Label>
        <Input id="name" name="name" type="text" defaultValue={name} required maxLength={120} disabled={pending} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="category">Kategori</Label>
          <Select id="category" name="category" defaultValue={category} disabled={pending}>
            {BusinessCategories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="phone">Nomor Telepon</Label>
          <Input id="phone" name="phone" type="tel" defaultValue={phone} placeholder="08xx-xxxx-xxxx" disabled={pending} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="product_type">Jenis Produk / Layanan</Label>
        <Input
          id="product_type"
          name="product_type"
          type="text"
          defaultValue={productType}
          placeholder="Contoh: kopi, jahit baju, jasa curhat"
          disabled={pending}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">Deskripsi</Label>
        <Textarea id="description" name="description" defaultValue={description} disabled={pending} />
      </div>

      {state?.error && (
        <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-expense/20 bg-expense/5 px-4 py-3 text-sm text-expense">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          {state.error}
        </div>
      )}
      {state?.success && (
        <div role="status" className="flex items-start gap-2.5 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-primary-ink">
          <CircleCheck className="mt-0.5 h-4 w-4 shrink-0" />
          {state.success}
        </div>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Simpan Perubahan
      </Button>
    </form>
  );
}
