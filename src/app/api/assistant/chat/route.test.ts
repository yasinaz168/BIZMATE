import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeMockSupabase, type QueryResult } from "@/test/mock-supabase";

/**
 * Pengujian logging error database di /api/assistant/chat (tahap 2 audit).
 *
 * Dijaga:
 * - Setiap kegagalan INSERT mencatat kode error + lokasi operasi.
 * - Log TIDAK memuat isi pesan pengguna, data transaksi, atau field
 *   sensitif objek error (details/hint).
 * - Respons ke pengguna tetap aman & tidak berubah.
 * - Chat TIDAK PERNAH menyimpan transaksi — simpan hanya lewat
 *   /api/assistant/save setelah konfirmasi pengguna.
 */

const holder = vi.hoisted(() => ({ client: null as unknown }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => holder.client,
}));

vi.mock("@/lib/supabase/config", () => ({
  isSupabaseConfigured: () => true,
}));

vi.mock("@/lib/ai/llm", () => ({
  runAssistant: async () => ({
    parsed: {
      reply: "Ini draf transaksi.",
      action_type: "transaction_ready",
      transaction: {
        type: "income",
        title: "JUDUL-DRAF-RAHASIA",
        quantity: 3,
        unit_price: 75000,
        payment_method: "cash",
        transacted_at: "2024-03-15",
        notes: "",
      },
    },
    simulationMode: true,
  }),
}));

import { POST } from "./route";

const USER_MESSAGE = "PESAN-PRIBADI-08123456789 jual kopi";

/** Error DB tiruan yang membawa data sensitif di banyak field */
function leakyError(code: string, sensitive: string) {
  return {
    code,
    message: `error sistem untuk ${code}`,
    details: `Key (title)=(${sensitive}) already exists.`,
    hint: "HINT-RAHASIA sk-super-secret-key",
    request: { body: "LEAK-REQUEST-BODY" },
  };
}

function chatRequest(): Request {
  return new Request("http://localhost/api/assistant/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: USER_MESSAGE, conversationId: null }),
  });
}

const businessOk: QueryResult = { data: { id: "biz-1", name: "Toko Uji" }, error: null };
const convOk: QueryResult = { data: { id: "conv-1" }, error: null };
const historyOk: QueryResult = { data: [], error: null };
const insertOk: QueryResult = { data: null, error: null };

let errorSpy: ReturnType<typeof vi.spyOn>;

function loggedText(): string {
  return errorSpy.mock.calls
    .map((call: unknown[]) => call.map((part: unknown) => String(part)).join(" "))
    .join("\n");
}

beforeEach(() => {
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
});

describe("POST /api/assistant/chat — logging kegagalan INSERT", () => {
  it("INSERT ai_conversations gagal: log lengkap, data pengguna tidak bocor", async () => {
    holder.client = makeMockSupabase([
      businessOk,
      { data: null, error: leakyError("42501", USER_MESSAGE) },
    ]);

    const res = await POST(chatRequest());
    const body = await res.json();

    // Respons pengguna tetap aman & tidak berubah
    expect(res.status).toBe(500);
    expect(body.error).toBe("Gagal memulai percakapan.");
    expect(JSON.stringify(body)).not.toContain("42501");

    // Log mencatat kode error + lokasi operasi
    const log = loggedText();
    expect(log).toContain("db_error");
    expect(log).toContain("42501");
    expect(log).toContain("ai_conversations");
    expect(log).toContain("api/assistant/chat");
    expect(log).toContain("insert");

    // Tidak membocorkan pesan pengguna / field sensitif error
    expect(log).not.toContain("PESAN-PRIBADI");
    expect(log).not.toContain("08123456789");
    expect(log).not.toContain("HINT-RAHASIA");
    expect(log).not.toContain("sk-super-secret-key");
    expect(log).not.toContain("LEAK-REQUEST-BODY");
  });

  it("INSERT ai_messages (pesan pengguna) gagal: log berlabel langkah, tanpa kebocoran", async () => {
    holder.client = makeMockSupabase([
      businessOk,
      convOk,
      historyOk,
      { data: null, error: leakyError("23514", USER_MESSAGE) },
    ]);

    const res = await POST(chatRequest());
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe("Gagal menyimpan pesan.");
    expect(JSON.stringify(body)).not.toContain("23514");

    const log = loggedText();
    expect(log).toContain("db_error");
    expect(log).toContain("23514");
    expect(log).toContain("ai_messages");
    expect(log).toContain("pesan pengguna");
    expect(log).not.toContain("PESAN-PRIBADI");
    expect(log).not.toContain("HINT-RAHASIA");
    expect(log).not.toContain("LEAK-REQUEST-BODY");
  });

  it("INSERT ai_messages (balasan AI) gagal: log berlabel langkah, draf transaksi tidak bocor", async () => {
    holder.client = makeMockSupabase([
      businessOk,
      convOk,
      historyOk,
      insertOk,
      { data: null, error: leakyError("42501", "JUDUL-DRAF-RAHASIA") },
    ]);

    const res = await POST(chatRequest());
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe("Gagal menyimpan balasan.");
    expect(JSON.stringify(body)).not.toContain("42501");

    const log = loggedText();
    expect(log).toContain("db_error");
    expect(log).toContain("42501");
    expect(log).toContain("ai_messages");
    expect(log).toContain("balasan AI");
    // Data transaksi (draf) & pesan pengguna tidak boleh masuk log
    expect(log).not.toContain("JUDUL-DRAF-RAHASIA");
    expect(log).not.toContain("PESAN-PRIBADI");
    expect(log).not.toContain("75000");
    expect(log).not.toContain("HINT-RAHASIA");
  });
});

describe("POST /api/assistant/chat — alur sukses & mekanisme konfirmasi", () => {
  it("sukses: tanpa error log, transaksi TIDAK disimpan (hanya draf via /save)", async () => {
    const client = makeMockSupabase([businessOk, convOk, historyOk, insertOk, {
      data: { id: "msg-1", created_at: "2026-10-31T10:00:00Z" },
      error: null,
    }]);
    holder.client = client;

    const res = await POST(chatRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.action_type).toBe("transaction_ready");
    expect(body.aiMessageId).toBe("msg-1");
    expect(body.transaction.title).toBe("JUDUL-DRAF-RAHASIA");
    expect(loggedText()).not.toContain("db_error");

    // Mekanisme konfirmasi: chat TIDAK PERNAH insert ke transactions
    const insertedTables = client.inserts.map((i) => i.table);
    expect(insertedTables).toContain("ai_conversations");
    expect(insertedTables).toContain("ai_messages");
    expect(insertedTables).not.toContain("transactions");
    expect(client.inserts).toHaveLength(3); // 1 percakapan + 2 pesan
  });
});
