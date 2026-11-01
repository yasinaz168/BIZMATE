import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeMockSupabase, type QueryResult } from "@/test/mock-supabase";

/**
 * Pengujian AI-R2 — transparansi status AI tri-state:
 * - API /api/assistant/chat meneruskan status AKUAT dari runAssistant
 *   (connected / simulation / provider_error), bukan dari keberadaan key.
 * - provider_error DIBEDAKAN dari simulation.
 * - Kontrak lama (simulationMode) tetap ada untuk kompatibilitas.
 * - UI memakai label tri-state + status awal "unknown" (tidak mengklaim
 *   connected hanya karena API key tersedia).
 */

const holder = vi.hoisted(() => ({
  client: null as unknown,
  result: null as {
    parsed: {
      reply: string;
      action_type: "none" | "transaction_ready";
      transaction: null;
    };
    simulationMode: boolean;
    status?: "connected" | "simulation" | "provider_error";
    reason?: string;
  } | null,
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
  runAssistant: async () => holder.result,
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

function freshClient() {
  const client = makeMockSupabase([
    businessOk,
    conversationOk,
    { data: [], error: null }, // riwayat kosong
    insertOk,
    assistantMsgOk,
  ]);
  holder.client = client;
  return client;
}

beforeEach(() => {
  holder.result = {
    parsed: { reply: "OK", action_type: "none", transaction: null },
    simulationMode: true,
    status: "simulation",
    reason: "no_key",
  };
});

describe("POST /api/assistant/chat — status AI tri-state (AI-R2)", () => {
  it("connected → aiStatus 'connected', tanpa reason, simulationMode false", async () => {
    freshClient();
    holder.result = {
      parsed: { reply: "OK", action_type: "none", transaction: null },
      simulationMode: false,
      status: "connected",
    };

    const body = await (await POST(chatRequest())).json();
    expect(body.aiStatus).toBe("connected");
    expect(body.aiStatusReason).toBeUndefined();
    expect(body.simulationMode).toBe(false); // kompatibilitas
  });

  it("simulation (tanpa key) → aiStatus 'simulation' + reason 'no_key'", async () => {
    freshClient();
    holder.result = {
      parsed: { reply: "OK", action_type: "none", transaction: null },
      simulationMode: true,
      status: "simulation",
      reason: "no_key",
    };

    const body = await (await POST(chatRequest())).json();
    expect(body.aiStatus).toBe("simulation");
    expect(body.aiStatusReason).toBe("no_key");
    expect(body.simulationMode).toBe(true);
  });

  it("provider_error → DIBEDAKAN dari simulation + reason aman diteruskan", async () => {
    freshClient();
    holder.result = {
      parsed: { reply: "OK", action_type: "none", transaction: null },
      simulationMode: true,
      status: "provider_error",
      reason: "http_5xx",
    };

    const body = await (await POST(chatRequest())).json();
    expect(body.aiStatus).toBe("provider_error");
    expect(body.aiStatus).not.toBe("simulation");
    expect(body.aiStatusReason).toBe("http_5xx");
    expect(body.simulationMode).toBe(true); // fallback tetap simulasi
  });

  it("kontrak lama (tanpa field status) → fallback dari simulationMode", async () => {
    freshClient();
    holder.result = {
      parsed: { reply: "OK", action_type: "none", transaction: null },
      simulationMode: false,
      // status sengaja tidak ada (kontrak lama)
    };

    const body = await (await POST(chatRequest())).json();
    expect(body.aiStatus).toBe("connected");
    expect(body.simulationMode).toBe(false);
  });

  it("respons lama tidak rusak: reply/transaction/aiMessageId tetap ada", async () => {
    freshClient();
    holder.result = {
      parsed: { reply: "OK", action_type: "none", transaction: null },
      simulationMode: true,
      status: "simulation",
    };

    const body = await (await POST(chatRequest())).json();
    expect(body.reply).toBe("OK");
    expect(body.action_type).toBe("none");
    expect(body.transaction).toBeNull();
    expect(body.aiMessageId).toBe("msg-asisten");
    expect(body.conversationId).toBe("c1");
  });
});

describe("kontrak UI — label tri-state & status awal jujur (AI-R2)", () => {
  const chatSource = readFileSync(
    fileURLToPath(new URL("../../../../components/assistant/chat.tsx", import.meta.url)),
    "utf8"
  );
  const pageSource = readFileSync(
    fileURLToPath(new URL("../../../../app/(app)/assistant/page.tsx", import.meta.url)),
    "utf8"
  );

  it("chat.tsx memakai label resmi untuk keempat kondisi", () => {
    for (const label of [
      "AI Terhubung",
      "Mode Simulasi",
      "AI Sedang Bermasalah",
      "Status AI belum diverifikasi",
    ]) {
      expect(chatSource).toContain(label);
    }
  });

  it("badge per pesan memakai status pesan tersebut", () => {
    expect(chatSource).toContain("m.aiStatus ?? aiStatus");
  });

  it("banner TIDAK mengklaim terhubung hanya karena key tersedia", () => {
    // status awal = unknown bila key ada, simulation bila tidak
    expect(pageSource).toContain(
      `initialAiStatus={isLLMConfigured() ? "unknown" : "simulation"}`
    );
    // bentuk lama (klaim berbasis key) tidak boleh kembali
    expect(pageSource).not.toContain("simulationMode={!isLLMConfigured()}");
  });
});
