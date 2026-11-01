"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CircleAlert, CircleCheck } from "lucide-react";
import { createManualTransactionAction } from "./actions";
import {
  MANUAL_REQUEST_FIELD,
  manualSuccessHref,
  manualSuccessMessage,
  newManualRequestId,
} from "./manual-form-logic";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getPaymentLabel } from "@/lib/format";
import { formatIDR } from "@/lib/format";
import { jakartaTodayISO } from "@/lib/time";
import { cn } from "@/lib/utils";
import {
  MAX_MONEY,
  MAX_QUANTITY,
  parseIdNumber,
  round2,
} from "@/lib/transactions/manual-validate";

/**
 * FORM TRANSAKSI MANUAL (client) — Tahap P5.4.4 + lifecycle idempotency R2.3.
 *
 * - Pratinjau total memakai parser/aturan validator yang SAMA
 *   (lib/transactions/manual-validate) — hanya kenyamanan UI; nilai
 *   final tetap dihitung oleh server action.
 * - request_id dibuat SEKALI per sesi form (crypto.randomUUID() di
 *   client — pola lifecycle POS); DIPERTAHANKAN saat validasi gagal,
 *   server error, atau koneksi putus → retry memakai kunci yang sama.
 *   Form baru = mount ulang = request_id baru (tidak diganti sebelum
 *   navigasi sukses / sesi form berikutnya benar-benar dimulai).
 * - Tanggal default diisi SETELAH mount (hindari selisih SSR/hidrasi).
 * - Submit → createManualTransactionAction (validasi ulang server).
 *   Sukses (termasuk REPLAY) → pesan informatif + diarahkan ke detail
 *   transaksi dengan transactionId hasil server (lama untuk replay).
 */

function getTypeLabelMeta(type: "income" | "expense"): string {
  return type === "income" ? "Pemasukan" : "Pengeluaran";
}

function formatQuantityPreview(value: number): string {
  return value.toLocaleString("id-ID", { maximumFractionDigits: 2 });
}

/** Jumlah/harga/hari yang diisikan bersih untuk preview/hint — bukan sumber kebenaran. */
function previewTotal(
  quantityText: string,
  priceText: string
): { label: string; ok: boolean } {
  const quantity = round2(parseIdNumber(quantityText));
  const price = round2(parseIdNumber(priceText));
  if (
    !Number.isFinite(quantity) ||
    !Number.isFinite(price) ||
    quantity <= 0 ||
    quantity > MAX_QUANTITY ||
    price < 0 ||
    price > MAX_MONEY ||
    round2(quantity * price) > MAX_MONEY
  ) {
    return { label: "—", ok: false };
  }
  return { label: formatIDR(round2(quantity * price)), ok: true };
}

export function ManualTransactionForm() {
  const [state, formAction, pending] = useActionState(
    createManualTransactionAction,
    null
  );
  const router = useRouter();
  const [type, setType] = useState<"income" | "expense">("income");
  const [quantityText, setQuantityText] = useState("");
  const [priceText, setPriceText] = useState("");
  const [dateValue, setDateValue] = useState(""); // "yyyy-MM-dd" WIB — diisi setelah mount
  // request_id idempotency (R2): dibuat SEKALI per sesi form memakai
  // crypto.randomUUID() — TETAP sama saat validasi/server/koneksi gagal
  // sehingga retry memakai kunci yang sama (pola lifecycle POS).
  const [requestId, setRequestId] = useState("");
  const navigatedRef = useRef(false);
  const done = Boolean(state?.ok); // sukses (termasuk replay) → form dikunci

  useEffect(() => {
    setDateValue(jakartaTodayISO());
  }, []);

  useEffect(() => {
    if (!requestId) {
      setRequestId(newManualRequestId());
    }
  }, [requestId]);

  // Sukses (termasuk REPLAY) → pesan informatif terbaca sebentar, lalu
  // diarahkan ke detail transaksi dengan transactionId hasil server
  // (transaksi LAMA untuk replay — tidak dibuat ulang).
  useEffect(() => {
    if (!state?.ok || navigatedRef.current) return;
    navigatedRef.current = true;
    const target = manualSuccessHref(state.transactionId);
    // Tanpa cleanup: navigasi terjadwal tetap berjalan walau React StrictMode
    // menjalankan efek berulang (push ke tujuan sama bersifat idempotent).
    setTimeout(() => {
      router.push(target);
    }, 1200);
  }, [state, router]);

  const total = previewTotal(quantityText, priceText);
  const fails = state && !state.ok ? state.fieldErrors ?? [] : [];

  return (
    <form
      action={formAction}
      className="space-y-5 rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-6"
      noValidate
    >
      {/* request_id — kunci idempotency (R2). Satu-satunya hidden input:
          BUKAN data sensitif dan TIDAK PERNAH memengaruhi business_id
          (business_id selalu dari lookup server di action). */}
      <input type="hidden" name={MANUAL_REQUEST_FIELD} value={requestId} />
      {/* ---------- umpan balik error (validasi / database) ---------- */}
      {state && !state.ok && (
        <section
          role="alert"
          className="flex items-start gap-2.5 rounded-2xl border border-expense/20 bg-expense/5 px-4 py-3 text-sm text-expense"
        >
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {state.error}
            {fails.length > 0 && (
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs leading-relaxed">
                {fails.map((fail) => (
                  <li key={fail}>{fail}</li>
                ))}
              </ul>
            )}
          </span>
        </section>
      )}

      {/* ---------- jenis: pemasukan / pengeluaran ---------- */}
      <fieldset>
        <legend className="sr-only">Jenis transaksi</legend>
        <Label>Jenis transaksi</Label>
        <div className="mt-1.5 grid grid-cols-2 gap-3">
          {(["income", "expense"] as const).map((option) => (
            <label
              key={option}
              className={cn(
                "flex cursor-pointer items-center gap-2.5 rounded-xl border px-4 py-3 text-sm font-medium transition-colors",
                type === option
                  ? option === "income"
                    ? "border-primary/40 bg-primary/5 text-primary-ink"
                    : "border-expense/40 bg-expense/5 text-expense"
                  : "border-line bg-surface text-muted-foreground hover:bg-muted/60"
              )}
            >
              <input
                type="radio"
                name="type"
                value={option}
                checked={type === option}
                onChange={() => setType(option)}
                className="accent-current"
                disabled={pending || done}
              />
              {getTypeLabelMeta(option)}
            </label>
          ))}
        </div>
      </fieldset>

      {/* ---------- keterangan ---------- */}
      <div className="space-y-1.5">
        <Label htmlFor="title">Keterangan transaksi</Label>
        <Input
          id="title"
          name="title"
          maxLength={160}
          required
          placeholder={
            type === "income"
              ? "Mis. Penjualan gula 5 kg"
              : "Mis. Pembelian beras 20 kg"
          }
          disabled={pending || done}
        />
      </div>

      {/* ---------- jumlah + harga satuan ---------- */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="quantity">Jumlah</Label>
          <Input
            id="quantity"
            name="quantity"
            inputMode="decimal"
            required
            placeholder="Mis. 5"
            value={quantityText}
            onChange={(e) => setQuantityText(e.target.value)}
            disabled={pending || done}
          />
          <p className="text-xs text-muted-foreground">
            Lebih dari 0 — maksimal {formatQuantityPreview(MAX_QUANTITY)}
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="unit_price">Harga satuan (Rp)</Label>
          <Input
            id="unit_price"
            name="unit_price"
            inputMode="decimal"
            required
            placeholder="Mis. 12500"
            value={priceText}
            onChange={(e) => setPriceText(e.target.value)}
            disabled={pending || done}
          />
          <p className="text-xs text-muted-foreground">
            Tidak boleh negatif — format biasa atau titik ribuan
          </p>
        </div>
      </div>

      {/* ---------- tanggal + metode bayar ---------- */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="transacted_at">Tanggal transaksi</Label>
          <Input
            id="transacted_at"
            name="transacted_at"
            type="date"
            required
            defaultValue={dateValue}
            disabled={pending || done}
          />
          <p className="text-xs text-muted-foreground">
            Tanggal hari ini (WIB) — boleh diubah ke hari sebelumnya
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="payment_method">Metode pembayaran</Label>
          <Select
            id="payment_method"
            name="payment_method"
            defaultValue="cash"
            disabled={pending || done}
          >
            <option value="cash">{getPaymentLabel("cash")}</option>
            <option value="transfer">{getPaymentLabel("transfer")}</option>
            <option value="qris">{getPaymentLabel("qris")}</option>
            <option value="ewallet">{getPaymentLabel("ewallet")}</option>
          </Select>
        </div>
      </div>

      {/* ---------- catatan ---------- */}
      <div className="space-y-1.5">
        <Label htmlFor="notes">Catatan (opsional)</Label>
        <Textarea
          id="notes"
          name="notes"
          rows={3}
          maxLength={500}
          placeholder="Mis. dibayar di muka, kwitansi No. 12"
          disabled={pending || done}
        />
      </div>

      {/* ---------- pratinjau total + aksi ---------- */}
      <div className="flex flex-col gap-4 rounded-xl border border-line bg-muted/40 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {total.ok ? "Total (pratinjau)" : "Total (menunggu isian valid)"}
          </p>
          <p className="mt-0.5 text-xl font-bold tabular-nums tracking-tight text-foreground">
            {total.label}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Nilai final tetap dihitung di server
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/transaksi"
            className={buttonVariants({ variant: "outline" })}
            aria-label="Batal dan kembali ke daftar transaksi"
          >
            Batal
          </Link>
          <Button type="submit" disabled={pending || done}>
            {pending ? "Menyimpan…" : done ? "Tersimpan" : "Simpan Transaksi"}
          </Button>
        </div>
      </div>

      {/* ---------- sukses (termasuk REPLAY) sebelum dialihkan ke detail ---------- */}
      {state?.ok && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-start gap-2 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-primary-ink"
        >
          <CircleCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p>
              {manualSuccessMessage(state.replay)} Membuka detail transaksi…
            </p>
            <Link
              href={manualSuccessHref(state.transactionId)}
              className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-primary underline underline-offset-4"
            >
              Lihat Detail Transaksi
            </Link>
          </div>
        </div>
      )}
    </form>
  );
}
