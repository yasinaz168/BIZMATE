import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * P4.1 — integrasi chat.tsx (pengelolaan percakapan):
 * - Menerima daftar percakapan + id aktif dari halaman (verifikasi server).
 * - Percakapan baru dibuat oleh API chat yang ada: kirim TANPA
 *   conversationId → respons mengisi id + memasukkan ke daftar lokal.
 * - startNewConversation mengosongkan konteks (pesan/preview/signer)
 *   tanpa menyentuh mekanisme preview/save/idempotency.
 */

const source = readFileSync(
  fileURLToPath(new URL("./chat.tsx", import.meta.url)),
  "utf8"
);

describe("chat.tsx — props & state percakapan (P4.1)", () => {
  it("menerima daftar percakapan dari halaman (verifikasi server)", () => {
    expect(source).toContain("conversationList: ConversationSummary[];");
    expect(source).toContain("initialConversationList");
  });

  it("state lokal: daftar + id percakapan aktif", () => {
    expect(source).toContain(
      "const [conversations, setConversations] = useState<ConversationSummary[]>("
    );
    expect(source).toContain(
      "const [activeConversationId, setActiveConversationId] = useState<"
    );
  });

  it("respon chat membawa isNewConversation (kontrak route tetap)", () => {
    expect(source).toContain("isNewConversation?: boolean;");
  });
});

describe("chat.tsx — startNewConversation mengosongkan konteks", () => {
  it("mengosongkan id aktif, pesan, preview, error atau writer", () => {
    expect(source).toContain("function startNewConversation(");
    expect(source).toContain("setConversationId(null);");
    expect(source).toContain("setActiveConversationId(null);");
    expect(source).toContain("setMessages([]);");
    expect(source).toContain("setPreview(null);");
  });

  it("preview transaksi & alur simpan tetap utuh (tidak disentuh)", () => {
    // alur draf: preview + request_id (R2.4) tak berubah
    expect(source).toContain("requestId: newAiRequestId()");
    expect(source).toContain("/api/assistant/save");
  });
});

describe("chat.tsx — ConversationList terpasang di layout", () => {
  it("daftar dirender + props aman", () => {
    expect(source).toContain("<ConversationList");
    expect(source).toContain("items={conversations}");
    expect(source).toContain("activeId={activeConversationId}");
    expect(source).toContain("onNew={startNewConversation}");
  });

  it("buka percakapan lama → push dengan param ter-encode", () => {
    expect(source).toContain(
      "/assistant?conversation=${encodeURIComponent(id)}"
    );
  });

  it("percakapan baru masuk daftar lokal tanpa reload", () => {
    expect(source).toContain("data.isNewConversation");
    expect(source).toContain("setConversations((prev) => [");
    expect(source).toContain("title: text.slice(0, 60)");
  });
});

describe("chat.tsx — hapus percakapan (P4.2) aktif-fallback", () => {
  it("handleDeleteConversation diwire ke ConversationList", () => {
    expect(source).toContain("onDelete={handleDeleteConversation}");
    expect(source).toContain("deleteConversationAction");
  });

  it("sukses → keluarkan dari daftar lokal", () => {
    expect(source).toContain(
      "const remaining = conversations.filter((c) => c.id !== id);"
    );
    expect(source).toContain("setConversations(remaining);");
  });

  it("percakapan AKTIF terhapus → pindah ke percakapan lain yang tersedia", () => {
    expect(source).toContain("encodeURIComponent(next.id)");
    expect(source).toContain("router.push(");
  });

  it("tidak ada percakapan lain → empty state (mulai percakapan baru)", () => {
    expect(source).toContain("startNewConversation(); // empty state");
  });

  it("TRANSAKSI tidak disentuh — hanya percakapan yang terkalibrasi", () => {
    // hanya menghapus ai_conversations; transactions tidak pernah muncul
    expect(source).not.toContain('"transactions"');
    expect(source).not.toContain('"transaction_items"');
  });
});
