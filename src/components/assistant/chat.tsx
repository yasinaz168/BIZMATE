"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bot,
  CircleCheck,
  CircleAlert,
  Loader2,
  Send,
  TriangleAlert,
  SquarePen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatIDR } from "@/lib/format";
import type {
  AiTransaction,
  ChatMessage,
  PaymentMethod,
  TransactionType,
} from "@/lib/ai/types";

/**
 * AI CHAT TRANSACTION — komponen interaktif.
 *
 * Aturan produk yang dijaga di UI:
 * - AI TIDAK PERNAH menyimpan sendiri. Intent dari server ditampilkan
 *   sebagai PREVIEW yang bisa diedit; tersimpan hanya setelah pengguna
 *   menekan tombol Simpan → POST /api/assistant/save (validasi ulang
 *   server, total dihitung di server).
 * - Mode Simulasi diberi BANNER + BADGE jelas; tidak pernah mengklaim
 *   AI sungguhan terhubang ketika LLM_API_KEY belum ada.
 */

const EXAMPLE_PROMPTS = [
  "Saya menjual 3 kaos seharga Rp75.000 per buah",
  "Hari ini terjual 10 gelas es teh Rp5.000 tunai",
  "Saya beli kopi 2 kg Rp180.000 transfer",
  "Kemarin bayar air 50rb cash",
  "Menjual 2 loyang brownies, total Rp110.000",
];

interface ChatApiResponseBody {
  reply?: string;
  transaction?: AiTransaction | null;
  conversationId?: string;
  aiMessageId?: string;
  simulationMode?: boolean;
  error?: string;
}

type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; title: string; amount: number };

export function AssistantChat({
  initialMessages,
  conversationId: initialConversationId,
  simulationMode,
}: {
  initialMessages: ChatMessage[];
  conversationId: string | null;
  simulationMode: boolean;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [conversationId, setConversationId] = useState<string | null>(
    initialConversationId
  );

  // ---------- preview transaksi (edit sebelum simpan) ----------
  const [preview, setPreview] = useState<{
    aiMessageId: string;
    transaction: AiTransaction;
    serverErrors: string[];
  } | null>(null);
  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" });

  const scrollRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, preview, saveState, sending]);

  // "YYYY-MM-DD" hari ini (WIB) — batas maksimal input tanggal
  const todayISO = useMemo(() => {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  }, []);

  async function send(rawText?: string) {
    const text = (rawText ?? input).trim();
    if (!text || sending) return;

    setInput("");
    setError(null);
    setSaveState({ kind: "idle" });
    // tampilkan bubble user optimis, diganti dengan versi server setelahnya
    const tempId = `temp-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: tempId, role: "user", content: text },
    ]);
    setSending(true);

    try {
      const response = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, conversationId }),
      });
      const data = (await response.json()) as ChatApiResponseBody;

      if (!response.ok || data.error) {
        setError(data.error ?? "Gagal mengirim pesan. Coba lagi.");
        // ganti pesan optimis agar tidak tampak "terkirim"
        setMessages((prev) =>
          prev.map((m) =>
            m.id === tempId ? { ...m, content: `${text} (gagal terkirim — coba ulang)` } : m
          )
        );
        return;
      }

      if (data.conversationId) setConversationId(data.conversationId);

      setMessages((prev) => [
        ...prev.map((m) => (m.id === tempId ? { ...m, content: text } : m)),
        {
          id: data.aiMessageId ?? `assistant-${Date.now()}`,
          role: "assistant",
          content: data.reply ?? "",
          transaction: data.transaction ?? null,
        },
      ]);

      if (data.transaction) {
        setPreview({
          aiMessageId: data.aiMessageId ?? "",
          transaction: { ...data.transaction },
          serverErrors: [],
        });
      } else {
        setPreview(null);
      }
    } catch {
      setError("Tidak bisa terhubung ke server. Periksa internetmu, lalu coba lagi.");
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setInput(text);
    } finally {
      setSending(false);
    }
  }

  // ---------- simpan (konfirmasi pengguna) ----------
  async function saveTransaction() {
    if (!preview || saveState.kind === "saving") return;
    setSaveState({ kind: "saving" });
    setError(null);

    try {
      const response = await fetch("/api/assistant/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transaction: preview.transaction }),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        summary?: string;
        error?: string;
        errors?: string[];
      };

      if (!response.ok || data.error) {
        setPreview((p) =>
          p ? { ...p, serverErrors: data.errors ?? [data.error ?? "Gagal menyimpan."] } : p
        );
        setSaveState({ kind: "idle" });
        return;
      }

      const tx = preview.transaction;
      const total = Math.round(tx.quantity * tx.unit_price);
      setSaveState({ kind: "saved", title: tx.title, amount: total });
      setPreview(null);
      router.refresh(); // dashboard & header ikut memakai data terbaru
    } catch {
      setError("Gagal menyimpan. Periksa internetmu, lalu coba lagi.");
      setSaveState({ kind: "idle" });
    }
  }

  function updatePreview(patch: Partial<AiTransaction>) {
    setPreview((p) =>
      p ? { ...p, transaction: { ...p.transaction, ...patch }, serverErrors: [] } : p
    );
  }

  function editPreviewFromChat(transaction: AiTransaction, aiMessageId: string) {
    setSaveState({ kind: "idle" });
    setPreview({ aiMessageId, transaction: { ...transaction }, serverErrors: [] });
  }

  const editabled =
    preview && preview.transaction.type && preview.transaction.title.length >= 1;

  return (
    <div className="flex flex-col gap-4">
      {/* Banner mode — transparan tentang kemampuan saat ini */}
      <div
        role="status"
        className={
          "flex items-start gap-3 rounded-xl border px-4 py-3 text-sm leading-relaxed " +
          (simulationMode
            ? "border-amber-300/60 bg-amber-50 text-amber-900"
            : "border-primary/25 bg-primary/5 text-primary-ink")
        }
      >
        {simulationMode ? (
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
        ) : (
          <Bot className="mt-0.5 h-4 w-4 shrink-0" />
        )}
        <span>
          {simulationMode ? (
            <>
              <strong>Mode Simulasi aktif.</strong> AI sungguhan belum terhubung (LLM_API_KEY
              belum diisi) — asisten memakai parser berbasis aturan Bahasa Indonesia. Hasil tetap
              dievaluasi &amp; wajib kamu konfirmasi sebelum disimpan.
            </>
          ) : (
            <>
              <strong>AI terhubung.</strong> Asisten hanya menyusun draf transaksi — kamu tetap
              mengatur isi form dan menekan Simpan.
            </>
          )}
        </span>
      </div>

      {/* Riwayat pesan */}
      <div
        ref={scrollRef}
        className="flex min-h-[320px] flex-col gap-4 rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-6"
        aria-live="polite"
      >
        {messages.length === 0 && (
          <div className="m-auto max-w-sm text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Bot className="h-6 w-6" />
            </span>
            <p className="mt-3 text-sm font-semibold">Halo! Ceritakan transaksimu di sini.</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Tulis seperti chat biasa, misalnya &quot;hari ini jual 3 kaos 75 ribu&quot;. Aku susun
              jadi data rapi — kamu cek dulu, baru disimpan.
            </p>
          </div>
        )}

        {messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm leading-relaxed text-primary-foreground shadow-sm">
                {m.content}
              </div>
            </div>
          ) : (
            <AssistantBubble
              key={m.id}
              message={m}
              simulationMode={simulationMode}
              onEdit={(tx) => editPreviewFromChat(tx, m.id)}
            />
          )
        )}

        {sending && (
          <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Bot className="h-4 w-4" />
            </span>
            <Loader2 className="h-4 w-4 animate-spin" />
            mengetik…
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-xl border border-expense/20 bg-expense/5 px-4 py-3 text-sm text-expense"
          >
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {saveState.kind === "saved" && (
          <div
            role="status"
            className="flex items-start gap-2.5 rounded-xl border border-primary/25 bg-primary/5 px-4 py-3 text-sm text-primary-ink"
          >
            <CircleCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              ✔ Tersimpan: <strong>{saveState.title}</strong> · {formatIDR(saveState.amount)}.
              Dashboard sudah diperbarui.
            </span>
          </div>
        )}

        {/* Preview editable + konfirmasi */}
        {preview && (
          <PreviewCard
            transaction={preview.transaction}
            serverErrors={preview.serverErrors}
            saving={saveState.kind === "saving"}
            todayISO={todayISO}
            editable={Boolean(editabled)}
            onChange={updatePreview}
            onCancel={() => {
              setPreview(null);
              setSaveState({ kind: "idle" });
            }}
            onSave={saveTransaction}
          />
        )}
        <div ref={endRef} />
      </div>

      {/* Contoh cepat */}
      <div className="flex flex-wrap gap-2" aria-label="Contoh kalimat">
        {EXAMPLE_PROMPTS.map((p) => (
          <button
            key={p}
            type="button"
            disabled={sending}
            onClick={() => send(p)}
            className="rounded-full border border-line bg-surface px-3.5 py-1.5 text-xs text-muted-foreground shadow-sm transition-colors hover:border-primary/40 hover:text-primary-ink disabled:opacity-50"
          >
            {p}
          </button>
        ))}
      </div>

      {/* Input pesan */}
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <div className="flex-1">
          <Textarea
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              // Enter kirim, Shift+Enter baris baru (kebiasaan chat)
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder="Tulis transaksi, mis. „Saya menjual 3 kaos seharga Rp75.000 per buah”"
            maxLength={1000}
            disabled={sending}
            aria-label="Pesan untuk asisten"
            className="min-h-[48px]"
          />
        </div>
        <Button type="submit" size="default" disabled={sending || input.trim().length === 0}>
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Kirim
        </Button>
      </form>
      <p className="text-center text-xs text-muted-foreground">
        Asisten tidak akan menyimpan apa pun tanpa konfirmasimu. Angka di preview bisa kamu edit
        langsung.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Bubble asisten + badge status                                       */
/* ------------------------------------------------------------------ */

function AssistantBubble({
  message,
  simulationMode,
  onEdit,
}: {
  message: ChatMessage;
  simulationMode: boolean;
  onEdit: (tx: AiTransaction) => void;
}) {
  const hasTx = Boolean(message.transaction);
  return (
    <div className="flex max-w-[95%] flex-col gap-2.5">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Bot className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1 rounded-2xl rounded-tl-md border border-line bg-background px-4 py-2.5 text-sm leading-relaxed text-foreground shadow-sm">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <span
              className={
                "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide " +
                (simulationMode ? "bg-amber-100 text-amber-900" : "bg-primary/15 text-primary-ink")
              }
            >
              {simulationMode ? "Mode Simulasi" : "AI"}
            </span>
            {hasTx && (
              <span className="rounded-full bg-foreground/5 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                draf transaksi — belum tersimpan
              </span>
            )}
          </div>
          {message.content}
        </div>
      </div>

      {hasTx && message.transaction && (
        <div className="ml-[42px]">
          <button
            type="button"
            onClick={() => onEdit(message.transaction!)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs font-semibold text-primary-ink transition-colors hover:bg-primary/10"
          >
            <SquarePen className="h-3.5 w-3.5" />
            Buka form transaksi ini
          </button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Preview editable                                                    */
/* ------------------------------------------------------------------ */

function PreviewCard({
  transaction,
  serverErrors,
  saving,
  todayISO,
  editable,
  onChange,
  onCancel,
  onSave,
}: {
  transaction: AiTransaction;
  serverErrors: string[];
  saving: boolean;
  todayISO: string;
  editable: boolean;
  onChange: (patch: Partial<AiTransaction>) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  // Total yang ditampilkan hanya CARA HITUNG yang sama dengan server;
  // angka final tetap dihitung ulang di /api/assistant/save.
  const shownTotal = Math.round(
    (Number(transaction.quantity) || 0) * (Number(transaction.unit_price) || 0)
  );
  const canSubmit =
    Boolean(transaction.type) &&
    transaction.title.trim().length > 0 &&
    (Number(transaction.quantity) > 0) &&
    Number(transaction.unit_price) >= 0;

  return (
    <div className="ml-[42px] rounded-2xl border border-primary/30 bg-surface shadow-lift" role="form" aria-label="Preview transaksi (bisa diedit)">
      <div className="flex items-center justify-between gap-2 border-b border-line px-5 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={
              "rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white " +
              (transaction.type === "income" ? "bg-primary-ink" : "bg-expense")
            }
          >
            {transaction.type === "income" ? "Pemasukan" : "Pengeluaran"}
          </span>
          <span className="text-xs text-muted-foreground">draf — edit bila perlu, lalu simpan</span>
        </div>
      </div>

      <div className="space-y-4 px-5 py-4">
        {serverErrors.length > 0 && (
          <div role="alert" className="rounded-xl border border-expense/20 bg-expense/5 px-4 py-3 text-sm text-expense">
            {serverErrors.map((e, i) => (
              <p key={i}>• {e}</p>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="p-type">Jenis</Label>
            <Select
              id="p-type"
              value={transaction.type}
              onChange={(e) => onChange({ type: e.target.value as TransactionType })}
              disabled={saving}
            >
              <option value="income">Pemasukan</option>
              <option value="expense">Pengeluaran</option>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="p-title">Deskripsi</Label>
            <Input
              id="p-title"
              value={transaction.title}
              onChange={(e) => onChange({ title: e.target.value })}
              maxLength={160}
              disabled={saving}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="p-qty">Jumlah</Label>
            <Input
              id="p-qty"
              type="number"
              min={0.01}
              step="any"
              value={String(transaction.quantity)}
              onChange={(e) => onChange({ quantity: Number(e.target.value) || 0 })}
              disabled={saving}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="p-price">Harga per Satuan (Rp)</Label>
            <Input
              id="p-price"
              type="number"
              min={0}
              step="any"
              value={String(transaction.unit_price)}
              onChange={(e) => onChange({ unit_price: Number(e.target.value) || 0 })}
              disabled={saving}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="p-payment">Metode Pembayaran</Label>
            <Select
              id="p-payment"
              value={transaction.payment_method ?? ""}
              onChange={(e) =>
                onChange({ payment_method: (e.target.value || null) as PaymentMethod | null })
              }
              disabled={saving}
              required
            >
              <option value="" disabled>
                Pilih metode…
              </option>
              <option value="cash">Tunai</option>
              <option value="transfer">Transfer</option>
              <option value="qris">QRIS</option>
              <option value="ewallet">E-Wallet</option>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="p-date">Tanggal</Label>
            <Input
              id="p-date"
              type="date"
              value={transaction.transacted_at ?? ""}
              max={todayISO}
              onChange={(e) => onChange({ transacted_at: e.target.value || null })}
              disabled={saving}
            />
            {!transaction.transacted_at && (
              <p className="text-xs text-muted-foreground">Dikosongkan = hari ini (WIB)</p>
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="p-notes">Catatan (opsional)</Label>
          <Textarea
            id="p-notes"
            rows={2}
            value={transaction.notes}
            onChange={(e) => onChange({ notes: e.target.value })}
            maxLength={500}
            disabled={saving}
          />
        </div>

        {/* Total — hitungan yang sama dengan server */}
        <div className="flex items-center justify-between rounded-xl bg-muted px-4 py-3">
          <span className="text-sm font-medium text-muted-foreground">Total</span>
          <span className="text-lg font-bold tabular-nums text-primary-ink">
            {formatIDR(shownTotal)}
          </span>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
            Batal
          </Button>
          <Button type="button" onClick={onSave} disabled={saving || !canSubmit || !editable}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CircleCheck className="h-4 w-4" />}
            Simpan Transaksi
          </Button>
        </div>
      </div>
    </div>
  );
}
