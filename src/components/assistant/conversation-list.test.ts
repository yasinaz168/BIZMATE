import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * P4.1 + P4.2 — daftar percakapan + hapus (komponen presentasional):
 * - Buka percakapan lama = navigasi aman /assistant?conversation=<id>
 *   (verifikasi kepemilikan dilakukan halaman, bukan komponen ini).
 * - "Percakapan Baru" TIDAK menavigasi — dikosongkan via callback onNew
 *   (mekanisme API chat yang ada membuat conversation baru).
 * - Hapus (P4.2): tombol per-item → DIALOG KONFIIRMASI → server action;
 *   UI tidak pernah memanggil DB langsung.
 * - TANPA penghapusan/arsip OTOMATIS — hanya tombol + konfirmasi pengguna.
 */

const source = readFileSync(
  fileURLToPath(new URL("./conversation-list.tsx", import.meta.url)),
  "utf8"
);

const chatSource = readFileSync(
  fileURLToPath(new URL("./chat.tsx", import.meta.url)),
  "utf8"
);

describe("conversation-list — buka percakapan lama (P4.1)", () => {
  it("klik item → onOpen(c.id); chat yang menavigasi ter-encode", () => {
    expect(source).toContain("onClick={() => onOpen(c.id)}");
    expect(chatSource).toContain(
      "/assistant?conversation=${encodeURIComponent(id)}"
    );
  });

  it("indikator aktif: item dengan id === activeId + aria-current", () => {
    expect(source).toContain("c.id === activeId");
    expect(source).toContain('aria-current={active ? "true" : undefined}');
  });
});

describe("conversation-list — Percakapan Baru (P4.1)", () => {
  it("tombol memanggil onNew (bukan navigasi); konteks dikosongkan di chat", () => {
    expect(source).toContain('aria-label="Mulai percakapan baru"');
    expect(source).toContain("onClick={onNew}");
    expect(chatSource).toContain("function startNewConversation(");
    expect(chatSource).toContain("setConversationId(null);");
    expect(chatSource).toContain("setMessages([]);");
    // kirim TANPA conversationId lama → conversation baru via API yang ada
    expect(chatSource).toContain(
      "body: JSON.stringify({ message: text, conversationId }),"
    );
  });

  it("preview transaksi & penyimpanan tidak dirusak", () => {
    expect(chatSource).toContain("requestId: newAiRequestId()");
    expect(chatSource).toContain("/api/assistant/save");
  });
});

describe("conversation-list — hapus percakapan (P4.2)", () => {
  it("tombol hapus per item membuka dialog konfirmasi (bukan langsung delete)", () => {
    expect(source).toContain("onClick={() => setConfirmId(c.id)}");
    expect(source).toContain('aria-label={`Hapus percakapan ${c.title ?? ""}`.trim()}');
    expect(source).toContain('role="dialog"');
    expect(source).toContain('aria-modal="true"');
  });

  it("dialog konfirmasi menjelaskan pesan ikut terhapus permanen", () => {
    expect(source).toContain("Hapus percakapan ini?");
    expect(source).toContain("terhapus <strong>permanen</strong>");
  });

  it("dialog menegaskan transaksi TIDAK ikut terhapus", () => {
    expect(source).toContain("TIDAK ikut");
    expect(source).toContain("terhapus");
  });

  it("feedback berhasil & gagal tersedia (aria-live)", () => {
    expect(source).toContain("aria-live=\"polite\"");
    expect(source).toContain('"Percakapan dihapus permanen');
    expect(source).toContain('"Percakapan sudah tidak ada');
    expect(source).toContain("result.message");
  });

  it("server action dipanggil lewat prop onDelete — UI tidak mengakses DB", () => {
    expect(source).toContain("const result = await onDelete(confirmId);");
    expect(source).not.toContain("createClient");
    expect(source).not.toContain("service_role");
    // chat.tsx yang menyambungkan ke server action
    expect(chatSource).toContain(
      'deleteConversationAction,'
    );
    expect(chatSource).toContain(
      '} from "@/app/(app)/assistant/actions";'
    );
    expect(chatSource).toContain("onDelete={handleDeleteConversation}");
  });
});

describe("conversation-list — TANPA penghapusan/arsip otomatis", () => {
  it("tidak ada penghapus waktu otomatis (setInterval/timeout)", () => {
    expect(source).not.toContain("setInterval");
    expect(source).not.toContain("setTimeout");
  });

  it("arsip hemat (P4.3) memang belum ada — kolom hanya disiapkan migration 00007", () => {
    expect(source).not.toContain("archive");
    expect(chatSource).not.toContain("arsip");
  });

  it("empty state informatif saat belum ada percakapan", () => {
    expect(source).toContain("Belum ada percakapan tersimpan");
  });
});
