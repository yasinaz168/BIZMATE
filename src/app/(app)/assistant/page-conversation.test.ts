import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * P4.1 — KEAMANAN halaman assistant (daftar & buka percakapan):
 * - Daftar wajib difilter business_id (dari lookup server, bukan browser).
 * - conversation dari searchParams TIDAK dipercaya: diverifikasi ulang
 *   (.eq id + .eq business_id) sebelum pesannya dimuat.
 * - ID asing/tidak valid → fallback percakapan terbaru tanpa bocor.
 * - Halaman tidak menulis apa pun (read-only).
 */

const source = readFileSync(
  fileURLToPath(new URL("./page.tsx", import.meta.url)),
  "utf8"
);

describe("assistant page — daftar percakapan milik bisnis (P4.1)", () => {
  it("daftar difilter business_id dari lookup server + urut updated_at", () => {
    expect(source).toContain('from("ai_conversations")');
    expect(source).toContain('.eq("business_id", business.id)');
    expect(source).toContain('.order("updated_at", { ascending: false })');
    expect(source).toContain(".limit(20)");
    // query DAFTAR TIDAK memakai id dari browser
    expect(source).not.toContain('.eq("id", requestedRaw');
    // pesan ter-limit seperti sebelumnya (30 terbaru)
    expect(source).toContain(".limit(30)");
  });

  it("param conversation diverifikasi miliknya SEBELUM pesan dimuat", () => {
    // verifikasi eksplisit id + business_id (dua .eq berurutan)
    expect(source).toContain('.eq("id", requestedId)');
    expect(source).toContain('.eq("business_id", business.id)');
    // pesan hanya dimuat untuk percakapan TERPILIH yang tersimpan
    expect(source).toContain(
      '.eq("conversation_id", selectedConversation.id)'
    );
  });

  it("param tidak valid (bukan UUID) tidak pernah masuk query", () => {
    expect(source).toContain("UUID_RE.test(requestedRaw.trim())");
  });

  it("fallback aman: siasingkan → pakai percakapan terbaru (list pertama)", () => {
    expect(source).toContain("if (!selectedConversation) {");
    expect(source).toContain("selectedConversation = conversations[0] ?? null;");
  });

  it("read-only: halaman tidak melakukan operasi tulis", () => {
    expect(source).not.toContain(".insert(");
    expect(source).not.toContain(".update(");
    expect(source).not.toContain(".delete(");
    expect(source).not.toContain("service_role");
  });

  it("daftar diteruskan ke komponen chat untuk ditampilkan", () => {
    expect(source).toContain("conversationList={conversations}");
    expect(source).toContain("conversationId={selectedConversation?.id ?? null}");
  });
});

describe("assistant page — R1 remount per percakapan (bug riwayat)", () => {
  it("AssistantChat diberi key berdasarkan id percakapan terpilih", () => {
    // TANPA key: React mempertahankan instance lama saat URL
    // /assistant?conversation=X → =Y → useState mengabaikan props baru
    // (pesan percakapan terpilih tidak pernah tampil).
    expect(source).toContain('key={selectedConversation?.id ?? "baru"}');
    // key berada TEPAT pada pemakaian AssistantChat
    const invocation = source.indexOf("<AssistantChat");
    const keyIndex = source.indexOf('key={selectedConversation?.id ?? "baru"}');
    expect(keyIndex).toBeGreaterThan(invocation);
  });

  it("props lain tetap utuh (initialMessages/conversationId/status/list)", () => {
    expect(source).toContain("initialMessages={initialMessages}");
    expect(source).toContain("conversationId={selectedConversation?.id ?? null}");
    expect(source).toContain(
      'initialAiStatus={isLLMConfigured() ? "unknown" : "simulation"}'
    );
    expect(source).toContain("conversationList={conversations}");
  });

  it("TANPA useEffect sinkronisasi props di chat.tsx (cukup key — hindari dua mekanisme)", () => {
    const chat = readFileSync(
      fileURLToPath(
        new URL("../../../../src/components/assistant/chat.tsx", import.meta.url)
      ),
      "utf8"
    );
    // tidak boleh ada sinkronisasi state dari props (initialMessages dsb.)
    expect(chat).not.toMatch(/useEffect\(\s*\(\)\s*=>\s*\{\s*setMessages\(initialMessages\)/);
    expect(chat).not.toMatch(/setMessages\(initialMessages\)/);
    expect(chat).not.toMatch(/setConversationId\(initialConversationId\)/);
  });
});
