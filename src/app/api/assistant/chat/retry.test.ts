import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeMockSupabase, type QueryResult } from "@/test/mock-supabase";

/**
 * Pengujian AI-R4 skenario 12 — interaksi retry dengan route chat:
 * - runAssistant ASLI dipakai (hanya fetch provider yang dimock) sehingga
 *   retry internal benar-benar terjadi di dalam satu request pengguna.
 * - Rate limiter AI-R3 dipanggil TEPAT SEKALI walau LLM retry.
 * - Insert pesan user/assistant TIDAK terduplikasi oleh retry.
 */

const holder = vi.hoisted(() => ({
  client: null as unknown,
  rateCalls: 0,
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
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: async () => {
    holder.rateCalls += 1;
    return { allowed: true, outcome: "ok", retryAfterSeconds: 30 };
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
  data: { id: "msg-asisten", created_at: "2026-11-02T04:00:00.000Z" },
  error: null,
};

function chatRequest(): Request {
  return new Request("http://localhost/api/assistant/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "halo", conversationId: "c1" }),
  });
}

function llmReply(content: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content } }] }),
  } as unknown as Response;
}

beforeEach(() => {
  holder.rateCalls = 0;
  vi.stubEnv("LLM_API_KEY", "sk-TEST-BUKAN-RAHASIA"); // jalur provider aktif
  holder.client = makeMockSupabase([
    businessOk,
    conversationOk,
    { data: [], error: null }, // riwayat
    insertOk, // pesan user
    assistantMsgOk, // balasan assistant
  ]);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("retry LLM dalam satu request chat (AI-R4)", () => {
  it("503 lalu sukses: rate limiter TEPAT 1×, insert tidak terduplikasi, balasan normal", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({ ok: false, status: 503, headers: { get: () => null }, json: async () => ({}) } as unknown as Response)
      .mockResolvedValueOnce(
        llmReply(`{"reply":"halo dari provider","action_type":"none","transaction":null}`)
      );

    const res = await POST(chatRequest());
    const body = await res.json();

    // retry terjadi (2 fetch provider) dalam SATU request user
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    // rate limiter AI-R3 dihitung tepat sekali — retry tidak membuang kuota
    expect(holder.rateCalls).toBe(1);
    // insert pesan: user + assistant = TEPAT 2 (tidak terulang oleh retry)
    const client = holder.client as ReturnType<typeof makeMockSupabase>;
    expect(client.inserts).toHaveLength(2);
    expect(client.inserts.filter((i) => i.table === "ai_messages")).toHaveLength(2);

    // respons normal (connected, balasan dari provider)
    expect(res.status).toBe(200);
    expect(body.reply).toBe("halo dari provider");
    expect(body.aiStatus).toBe("connected");
    expect(body.simulationMode).toBe(false);

    errorSpy.mockRestore();
  });

  it("seluruh percobaan gagal: tetap 1× rate limit, 1× insert user + 1× insert assistant (fallback simulasi)", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new TypeError("fetch failed"));

    const res = await POST(chatRequest());
    const body = await res.json();

    expect(fetchSpy).toHaveBeenCalledTimes(2); // retry maksimal 1×
    expect(holder.rateCalls).toBe(1);
    const client = holder.client as ReturnType<typeof makeMockSupabase>;
    expect(client.inserts).toHaveLength(2); // tanpa duplikasi
    // fallback simulasi berlabel (AI-R2) — provider_error terbedakan
    expect(res.status).toBe(200);
    expect(body.aiStatus).toBe("provider_error");
    expect(body.simulationMode).toBe(true);

    errorSpy.mockRestore();
  });
});
