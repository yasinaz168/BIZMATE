import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeMockSupabase, type QueryResult } from "@/test/mock-supabase";

/**
 * Pengujian AI-R1 — perbaikan riwayat percakapan:
 * - Query meminta 14 pesan TERBARU (order created_at DESC + limit 14).
 * - Hasil dibalik ke urutan kronologis sebelum diteruskan ke runAssistant.
 * - Percakapan < 14 pesan tetap benar.
 * - Percakapan milik bisnis LAIN tidak pernah masuk riwayat.
 */

const holder = vi.hoisted(() => ({
  client: null as unknown,
  history: null as Array<{ role: string; content: string }> | null,
  businessName: "",
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => holder.client,
}));
vi.mock("@/lib/supabase/config", () => ({
  isSupabaseConfigured: () => true,
}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));
vi.mock("@/lib/ai/llm", () => ({
  runAssistant: async (
    history: Array<{ role: string; content: string }>,
    businessName: string
  ) => {
    holder.history = history;
    holder.businessName = businessName;
    return {
      parsed: { reply: "OK", action_type: "none", transaction: null },
      simulationMode: true,
    };
  },
}));

import { POST } from "./route";

const businessOk: QueryResult = { data: { id: "biz-1", name: "Toko" }, error: null };
const conversationOk: QueryResult = {
  data: { id: "c1", business_id: "biz-1" },
  error: null,
};
const insertOk: QueryResult = { data: null, error: null };
const assistantMsgOk: QueryResult = {
  data: { id: "msg-asisten", created_at: "2026-11-01T04:00:00.000Z" },
  error: null,
};

function chatRequest(): Request {
  return new Request("http://localhost/api/assistant/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "halo", conversationId: "c1" }),
  });
}

/** Baris riwayat ala query DESC: index 0 = TERBARU */
function descRows(count: number) {
  return Array.from({ length: count }, (_, i) => {
    const seq = count - i; // 16, 15, ... 1 (seq kecil = makin lama)
    return {
      role: seq % 2 === 1 ? "user" : "assistant",
      content: `pesan-${String(seq).padStart(2, "0")}`,
      structured_data: null,
    };
  });
}

beforeEach(() => {
  holder.history = null;
  holder.businessName = "";
});

describe("chat route — riwayat 14 pesan TERBARU (AI-R1)", () => {
  it("mengambil 14 pesan terbaru (DESC) lalu mengembalikannya kronologis", async () => {
    const client = makeMockSupabase([
      businessOk,
      conversationOk,
      { data: descRows(16), error: null }, // 16 pesan tersimpan (DESC)
      insertOk, // pesan pengguna
      assistantMsgOk, // balasan assistant
    ]);
    holder.client = client;

    const res = await POST(chatRequest());
    expect(res.status).toBe(200);

    const history = holder.history ?? [];
    // hanya 14 pesan terbaru yang diteruskan (pesan-01 & pesan-02 terbuang)
    expect(history).toHaveLength(14);
    expect(history.map((m) => m.content)).not.toContain("pesan-01");
    expect(history.map((m) => m.content)).not.toContain("pesan-02");
    // urutan KRONOLOGIS: lama → baru (pesan-03 paling awal, pesan-16 terbaru)
    expect(history[0].content).toBe("pesan-03");
    expect(history[13].content).toBe("pesan-16");
    expect(holder.businessName).toBe("Toko");
  });

  it("percakapan < 14 pesan → semua terpakai, urutan tetap kronologis", async () => {
    const client = makeMockSupabase([
      businessOk,
      conversationOk,
      { data: descRows(3), error: null }, // pesan-03, pesan-02, pesan-01 (DESC)
      insertOk,
      assistantMsgOk,
    ]);
    holder.client = client;

    await POST(chatRequest());

    const history = holder.history ?? [];
    expect(history.map((m) => m.content)).toEqual([
      "pesan-01",
      "pesan-02",
      "pesan-03",
    ]);
  });

  it("conversationId milik bisnis LAIN → tidak ada riwayat asing yang diteruskan", async () => {
    const client = makeMockSupabase([
      businessOk,
      // conversation ada tapi business_id berbeda → harus diabaikan
      { data: { id: "c-asing", business_id: "biz-LAIN" }, error: null },
      { data: { id: "c-baru" }, error: null }, // insert percakapan baru
      { data: [], error: null }, // riwayat percakapan baru = kosong
      insertOk,
      assistantMsgOk,
    ]);
    holder.client = client;

    const res = await POST(
      new Request("http://localhost/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "halo", conversationId: "c-asing" }),
      })
    );

    expect(res.status).toBe(200);
    expect(holder.history).toEqual([]); // TANPA baris milik bisnis lain
    // percakapan baru dibuat untuk bisnis sendiri
    expect(client.inserts[0]?.table).toBe("ai_conversations");
    expect(client.inserts[0]?.payload?.business_id).toBe("biz-1");
  });

  it("kontrak source: query memakai DESC + limit 14 + reverse", () => {
    const source = readFileSync(fileURLToPath(new URL("./route.ts", import.meta.url)), "utf8");
    expect(source).toContain('.order("created_at", { ascending: false })');
    expect(source).toContain(".limit(14)");
    expect(source).toContain(".reverse()");
    // bentuk lama (bug) tidak boleh kembali
    expect(source).not.toContain(".order(\"created_at\", { ascending: true })");
  });
});
