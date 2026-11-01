"use client";

import { useEffect, useRef } from "react";
import { useActionState } from "react";
import { CircleAlert, Loader2, X, CircleCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProductCategories, ProductUnits } from "@/lib/constants";
import type { Product } from "@/types";
import {
  createProductAction,
  updateProductAction,
  type ProductFormState,
} from "./actions";

/**
 * FORM PRODUK — tambah & edit (Tahap P3).
 *
 * - Memakai useActionState dengan server action P2
 *   (createProductAction / updateProductAction).
 * - Mode edit mengisi nilai awal dari data produk.
 * - Field opsional dibiarkan kosong bila memang tidak diisi.
 * - is_active TIDAK ada di form — status diubah lewat tombol
 *   aktif/nonaktif (setProductActiveAction).
 */

interface ProductFormProps {
  mode: "create" | { edit: Product };
  onSuccess: (message: string) => void;
  onCancel: () => void;
}

export function ProductForm({ mode, onSuccess, onCancel }: ProductFormProps) {
  const isEdit = typeof mode !== "string";
  const product = isEdit ? mode.edit : null;

  // Dua hook dipanggil tanpa syarat (aturan hooks) — yang dipakai dipilih per mode
  const [createState, createFormAction, createPending] = useActionState(
    createProductAction,
    null
  );
  const [updateState, updateFormAction, updatePending] = useActionState(
    updateProductAction,
    null
  );

  const state: ProductFormState | null = isEdit ? updateState : createState;
  const pending = isEdit ? updatePending : createPending;

  // Panggil onSuccess hanya sekali per hasil sukses (hindari efek berulang)
  const handledRef = useRef<ProductFormState | null>(null);
  useEffect(() => {
    if (state?.success && handledRef.current !== state) {
      handledRef.current = state;
      onSuccess(state.success);
    }
  }, [state, onSuccess]);

  return (
    <form
      action={isEdit ? updateFormAction : createFormAction}
      className="rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-6"
      aria-label={isEdit ? "Form edit produk" : "Form tambah produk"}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-foreground">
          {isEdit ? "Edit Produk" : "Tambah Produk"}
        </h3>
        <Button type="button" variant="ghost" size="icon" onClick={onCancel} aria-label="Tutup form">
          <X />
        </Button>
      </div>

      {state?.error && (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2.5 rounded-xl border border-expense/20 bg-expense/5 px-4 py-3 text-sm text-expense"
        >
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{state.error}</span>
        </div>
      )}

      {isEdit && product && (
        <input type="hidden" name="product_id" value={product.id} />
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="p-name">Nama Produk</Label>
          <Input
            id="p-name"
            name="name"
            defaultValue={product?.name ?? ""}
            placeholder="Mis. Kopi Bubuk 250gr"
            maxLength={160}
            required
            disabled={pending}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="p-category">Kategori (opsional)</Label>
          <Input
            id="p-category"
            name="category"
            list="kategori-produk"
            defaultValue={product?.category ?? ""}
            placeholder="Pilih atau ketik sendiri"
            maxLength={80}
            disabled={pending}
          />
          <datalist id="kategori-produk">
            {ProductCategories.map((kategori) => (
              <option key={kategori} value={kategori} />
            ))}
          </datalist>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="p-unit">Satuan (opsional)</Label>
          <Input
            id="p-unit"
            name="unit"
            list="satuan-produk"
            defaultValue={product?.unit ?? ""}
            placeholder="Mis. pack, kg"
            maxLength={40}
            disabled={pending}
          />
          <datalist id="satuan-produk">
            {ProductUnits.map((satuan) => (
              <option key={satuan} value={satuan} />
            ))}
          </datalist>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="p-price">Harga Jual (Rp)</Label>
          <Input
            id="p-price"
            name="selling_price"
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            defaultValue={product ? String(product.selling_price) : ""}
            placeholder="0"
            required
            disabled={pending}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="p-cost">Harga Modal (Rp, opsional)</Label>
          <Input
            id="p-cost"
            name="unit_cost"
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            defaultValue={product?.unit_cost != null ? String(product.unit_cost) : ""}
            placeholder="Kosongkan bila tidak dicatat"
            disabled={pending}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="p-stock">Stok (opsional)</Label>
          <Input
            id="p-stock"
            name="stock"
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            defaultValue={product?.stock != null ? String(product.stock) : ""}
            placeholder="Kosongkan bila tidak dilacak"
            disabled={pending}
          />
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
          Batal
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CircleCheck />}
          {isEdit ? "Simpan Perubahan" : "Simpan Produk"}
        </Button>
      </div>
    </form>
  );
}
