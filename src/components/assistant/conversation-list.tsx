"use client";

import { useState } from "react";
import { Plus, Trash2, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import type { ConversationSummary } from "@/lib/ai/types";
import type { ConversationDeleteResult } from "@/app/(app)/assistant/actions";

/**
 * =====================================================================
 * DAFTAR PERCAKAPAN + HAPUS (P4.1 + P4.2) — client presentasional.
 * =====================================================================
 * - Buka percakapan lama → `onOpen(id)` (navigasi server-side ke
 *   /assistant?conversation=<id> — kepemilikan diverifikasi ulang oleh
 *   halaman dengan business_id dari server).
 * - Tombol "Percakapan Baru" TIDAK menavigasi: memanggil `onNew()` agar
 *   konteks chat aktif dikosongkan; pesan berikutnya otomatis membuat
 *   conversation baru melalui peran /api/assistant/chat yang sudah ada.
 * - HAPUS (P4.2): tombol per-item → DIALOG KONFIRMASI eksplisit →
 *   `onDelete(id)` (server action deleteConversationAction — ownership
 *   & business_id diverifikasi SERVE). UI TIDAK pernah memanggil DB.
 *
 * ETHIS PRODUK (dijamin dalam kode dan dialog):
 * - TIDAK ADA penghapusan otomatis / batas waktu;
 *   penghapusan hanya lewat tombol + konfirmasi pengguna.
 * - SELURUH pesan percakapan ikut terhapus permanen (cascade), sedangkan
 *   TRANSAKSI yang sudah tersimpan TIDAK ikut (schema tidak berrelasi).
 */

/** Teks keputusan hapus — respons dari server action */
export interface ConversationListProps {
  items: ConversationSummary[];
  /** id percakapan aktif di kolom chat — null = konten baru */
  activeId: string | null;
  /** buka percakapan lama (navigasi aman memakai param) */
  onOpen: (id: string) => void;
  /** mulai konten baru (pastinya di chat.tsx) */
  onNew: () => void;
  /** panggil server action hapus — hasil balance kembalikan>A */
  onDelete: (id: string) => Promise<ConversationDeleteResult>;
  disabled?: boolean;
}

/** "28 Nov 2026, 14.30" (WIB) — label waktu lokal daftar */
function listDateLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const datePart = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
  const timePart = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
  return `${datePart} · ${timePart}`;
}

export function ConversationList({
  items,
  activeId,
  onOpen,
  onNew,
  onDelete,
  disabled = false,
}: ConversationListProps) {
  // ---------- dialog & feedback hapus (P4.2) ----------
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<
    { kind: "ok" | "error"; text: string } | null
  >(null);

  async function handleConfirmDelete() {
    if (!confirmId) return;
    setDeletingId(confirmId);
    const result = await onDelete(confirmId);
    setDeletingId(null);
    setConfirmId(null);

    if (result.status === "deleted") {
      setFeedback({ kind: "ok", text: "Percakapan dihapus permanen — seluruh pesannya ikut terhapus." });
    } else if (result.status === "not_found") {
      setFeedback({ kind: "ok", text: "Percakapan sudah tidak ada (kemungkinan sudah dihapus)." });
    } else {
      setFeedback({ kind: "error", text: result.message });
    }
  }

  return (
    <aside
      aria-label="Daftar percakapan"
      className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 shadow-card"
    >
      <button
        type="button"
        onClick={onNew}
        disabled={disabled}
        aria-label="Mulai percakapan baru"
        className={cn(
          "flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-primary-ink",
          "border border-primary/30 bg-primary/5 transition-colors hover:bg-primary/10",
          disabled && "cursor-not-allowed opacity-50"
        )}
      >
        <Plus className="h-4 w-4" />
        Percakapan Baru
      </button>

      {/* ---------- keberhasilan/gagal hapus (P4.2) ---------- */}
      {feedback && (
        <p
          role="status"
          aria-live="polite"
          className={cn(
            "rounded-lg px-3 py-2 text-xs leading-relaxed",
            feedback.kind === "ok"
              ? "bg-primary/5 text-primary-ink"
              : "bg-expense/5 text-expense"
          )}
        >
          {feedback.text}
        </p>
      )}

      {items.length === 0 ? (
        <p className="rounded-lg bg-muted/40 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
          Belum ada percakapan tersimpan. Mulai mengobrol — percakapanmu akan
          muncul di sini.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {items.map((c) => {
            const active = c.id === activeId;
            const deleting = deletingId === c.id;
            return (
              <li key={c.id} className="group relative">
                <div
                  className={cn(
                    "flex items-center justify-between gap-2 rounded-lg pr-2 pl-3 py-2 text-left transition-colors",
                    active
                      ? "border border-primary/30 bg-primary/5"
                      : "border border-transparent hover:bg-muted/60"
                  )}
                >
                  {/* BUKA percakapan lama */}
                  <button
                    type="button"
                    onClick={() => onOpen(c.id)}
                    aria-current={active ? "true" : undefined}
                    className="min-w-0 flex-1 text-left"
                    disabled={disabled || deleting}
                  >
                    <p
                      className={cn(
                        "truncate text-sm font-medium",
                        active ? "text-primary-ink" : "text-foreground"
                      )}
                    >
                      {c.title ?? "(tanpa judul)"}
                    </p>
                    <p
                      className={cn(
                        "mt-0.5 truncate text-[11px] tabular-nums",
                        active ? "text-primary/70" : "text-muted-foreground"
                      )}
                    >
                      {listDateLabel(c.updated_at)}
                    </p>
                  </button>

                  {/* HAPUS percakapan (P4.2) */}
                  <button
                    type="button"
                    onClick={() => setConfirmId(c.id)}
                    disabled={disabled || deleting}
                    aria-label={`Hapus percakapan ${c.title ?? ""}`.trim()}
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-expense/10 hover:text-expense",
                      deleting && "opacity-50"
                    )}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* ---------- dialog konfirmasi hapus (P4.2) ---------- */}
      {confirmId && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Konfirmasi hapus percakapan"
          className="fixed inset-0 z-50 flex items-center justify-center bg-primary-deep/60 p-4"
          onClick={(e) => {
            // klik backdrop = batalkan (bukan klik di dalam dialog)
            if (e.target === e.currentTarget) setConfirmId(null);
          }}
        >
          <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-5 shadow-lift">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-expense/10 text-expense">
                <TriangleAlert className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  Hapus percakapan ini?
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Seluruh <strong>pesan dalam percakapan ini</strong> akan
                  terhapus <strong>permanen</strong> dan tidak bisa
                  dikembalikan.
                </p>
                <p className="mt-1 rounded-lg bg-muted/40 px-2.5 py-1.5 text-[11px] leading-relaxed text-muted-foreground">
                  Transaksi yang sudah tersimpan <strong>TIDAK ikut
                  terhapus</strong>.
                </p>
              </div>
            </div>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setConfirmId(null)}
                className="rounded-lg border border-line bg-surface px-3.5 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={deletingId !== null}
                className={cn(
                  buttonVariants({ variant: "destructive", size: "default" }),
                  deletingId !== null && "pointer-events-none opacity-50"
                )}
              >
                {deletingId !== null ? "Menghapus…" : "Hapus Permanen"}
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
