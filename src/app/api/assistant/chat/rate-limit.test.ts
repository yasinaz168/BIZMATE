import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeMockSupabase, type QueryResult } from "@/test/mock-supabase";

/**
 * Pengujian AI-R3.2 — rate limiting endpoint chat:
 * - Terblokir → 429 + Retry-After + pesan Indonesia, TANPA menyentuh
 *   DB bisnis/LLM (gate sebelum lookup bisnis).
 * - Lolos → alur chat normal (regresi AI-R1/R2 terjaga).
 * - Validasi pesan & auth tetap SEBELUM rate limit (400/401 tanpa kuota).
 */

const holder = vi.hoisted(() => ({
  client: null as unknown,
  rate: {
    allowed: true,
    outcome: "ok" as "ok" | "blocked" | "error" | "disabled",
    retryAfterSeconds: 30,
  },
  rateCalls: [] as Array<{ scope: string; userId: string }>,
  assistantCalls: 0,
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
  checkRateLimit: async (scope: string, userId: string) => {
    holder.rateCalls.push({ scope, userId });
    return holder.rate;
  },
}));
vi.mock("@/lib/ai/llm", () => ({
  runAssistant: async () => {
    holder.assistantCalls += 1;
    return {
      parsed: { reply: "OK", action_type: "none", transaction: null },
      simulationMode: true,
      status: "simulation",
    };
  },
}));

import { POST } from "./route";

const businessOk: QueryResult = { data: { id: "biz-1", name: "Toko" }, error: null };
const insertOk: QueryResult = { data: null, error: null };
const assistantMsgOk: QueryResult = {
  data: { id: "msg-asisten", created_at: "2026-11-02T04:00:00.000Z" },
  error: null,
};

function chatRequest(message = "halo"): Request {
  return new Request("http://localhost/api/assistant/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });
}

/** Client yang MENOLAK semua query DB — membuktikan gate di depan lookup */
function denyDbClient() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
    from: () => {
      throw new Error("TIDAK BOLEH QUERY DB setelah rate limit tercapai");
    },
  } as unknown;
}

beforeEach(() => {
  holder.rate = { allowed: true, outcome: "ok", retryAfterSeconds: 30 };
  holder.rateCalls = [];
  holder.assistantCalls = 0;
  holder.client = makeMockSupabase([
    businessOk,
    { data: { id: "c1" }, error: null }, // insert percakapan baru
    { data: [], error: null }, // riwayat
    insertOk, // pesan user
    assistantMsgOk, // balasan
  ]);
});

describe("POST /api/assistant/chat — rate limit (AI-R3.2)", () => {
  it("terblokir → 429 + Retry-After + pesan Indonesia, tanpa DB bisnis & tanpa LLM", async () => {
    holder.client = denyDbClient();
    holder.rate = { allowed: false, outcome: "blocked", retryAfterSeconds: 42 };

    const res = await POST(chatRequest());
    const body = await res.json();

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("42");
    expect(body.error).toBe(
      "Terlalu banyak permintaan. Coba lagi dalam beberapa saat."
    );
    expect(holder.assistantCalls).toBe(0); // LLM tidak dipanggil
  });

  it("lolos → alur chat normal (200) dan LLM tetap dipanggil", async () => {
    const res = await POST(chatRequest("hari ini jual kopi"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.reply).toBe("OK");
    expect(holder.assistantCalls).toBe(1);
    // scope & user id untuk key internal limiter
    expect(holder.rateCalls).toEqual([{ scope: "chat", userId: "user-1" }]);
  });

  it("pesan tidak valid → 400 SEBELUM rate limit (tidak membuang kuota)", async () => {
    holder.client = denyDbClient();

    const res = await POST(chatRequest(""));
    expect(res.status).toBe(400);
    expect(holder.rateCalls).toEqual([]);
  });

  it("tanpa sesi → 401 SEBELUM rate limit", async () => {
    const client = makeMockSupabase([]);
    client.auth.getUser = async () => ({ data: { user: null } });
    holder.client = client;

    const res = await POST(chatRequest());
    expect(res.status).toBe(401);
    expect(holder.rateCalls).toEqual([]);
  });

  it("limiter fail-open (outcome 'error') → chat tetap diteruskan", async () => {
    holder.rate = { allowed: true, outcome: "error", retryAfterSeconds: 1 };

    const res = await POST(chatRequest());
    expect(res.status).toBe(200);
  });
});
