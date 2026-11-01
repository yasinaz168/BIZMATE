import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeMockSupabase, type QueryResult } from "@/test/mock-supabase";

/**
 * Pengujian AI-R3.3 — rate limit endpoint save dengan REPLAY BYPASS.
 * Urutan mandat sebelum 429:
 *   validasi request_id+payload → business_id server → cek transaksi lama
 *   (business_id + request_id) → isSameAiPayload →
 *   cocok 200 replay:true | beda 409 | tidak ada 429 + Retry-After.
 * Jalur lolos-limit TIDAK berubah (INSERT R2.4).
 */

const holder = vi.hoisted(() => ({
  client: null as unknown,
  rate: {
    allowed: true,
    outcome: "ok" as "ok" | "blocked" | "error" | "disabled",
    retryAfterSeconds: 30,
  },
  rateCalls: [] as Array<{ scope: string; userId: string }>,
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

import { revalidatePath } from "next/cache";
import { POST } from "./route";

/** Akses mock bertipe (holder.client sengaja `unknown` untuk mock module) */
function mock() {
  return holder.client as ReturnType<typeof makeMockSupabase>;
}

const REQUEST_ID = "c3d4e5f6-a7b8-4c9d-8e0f-1a2b3c4d5e6f";

const TX = {
  type: "income",
  title: "JUDUL-TRANSAKSI-RAHASIA",
  quantity: 2,
  unit_price: 50000,
  payment_method: "cash",
  transacted_at: "2024-03-15",
  notes: "CATATAN-PRIBADI",
};

const businessOk: QueryResult = { data: { id: "biz-1" }, error: null };
const insertOk: QueryResult = { data: { id: "tx-baru" }, error: null };

/** Baris lama hasil read-back — setara VALIDATED(TX) */
function storedRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "tx-old-1",
    source: "ai_chat",
    type: "income",
    title: "JUDUL-TRANSAKSI-RAHASIA",
    quantity: "2",
    unit_price: "50000",
    total: "100000",
    transacted_at: "2024-03-15T05:00:00.000Z",
    payment_method: "cash",
    notes: "CATATAN-PRIBADI",
    ...overrides,
  };
}

function saveRequest(fields: Record<string, unknown> = {}): Request {
  return new Request("http://localhost/api/assistant/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transaction: TX, request_id: REQUEST_ID, ...fields }),
  });
}

beforeEach(() => {
  holder.rate = { allowed: true, outcome: "ok", retryAfterSeconds: 30 };
  holder.rateCalls = [];
  holder.client = makeMockSupabase([businessOk, insertOk]);
  vi.mocked(revalidatePath).mockClear();
});

describe("POST /api/assistant/save — rate limit + replay bypass (AI-R3.3)", () => {
  it("mandat 7: terblokir + TIDAK ada transaksi lama → 429 + Retry-After, tanpa INSERT", async () => {
    holder.client = makeMockSupabase([
      businessOk,
      { data: null, error: null }, // read-back: tidak ada baris
    ]);
    holder.rate = { allowed: false, outcome: "blocked", retryAfterSeconds: 55 };

    const res = await POST(saveRequest());
    const body = await res.json();

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("55");
    expect(body.error).toBe("Terlalu banyak permintaan. Coba lagi dalam beberapa saat.");
    expect(mock().inserts).toHaveLength(0); // tanpa baris baru
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(holder.rateCalls).toEqual([{ scope: "save", userId: "user-1" }]);
  });

  it("mandat 5: terblokir + payload lama COCOK → 200 replay:true (transactionId lama), tanpa INSERT", async () => {
    holder.client = makeMockSupabase([
      businessOk,
      { data: storedRow(), error: null }, // read-back: baris lama cocok
    ]);
    holder.rate = { allowed: false, outcome: "blocked", retryAfterSeconds: 30 };

    const res = await POST(saveRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.transactionId).toBe("tx-old-1"); // LAMA
    expect(body.replay).toBe(true);
    expect(mock().inserts).toHaveLength(0); // tidak dibuat ulang
    expect(mock().updates).toHaveLength(0); // tidak diubah
    expect(revalidatePath).not.toHaveBeenCalled(); // replay tanpa revalidate
  });

  it("mandat 6: terblokir + payload BERBEDA → 409, tanpa INSERT & tanpa revalidate", async () => {
    holder.client = makeMockSupabase([
      businessOk,
      { data: storedRow({ total: "99999" }), error: null }, // total beda
    ]);
    holder.rate = { allowed: false, outcome: "blocked", retryAfterSeconds: 30 };

    const res = await POST(saveRequest());
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toBe(
      "Permintaan ini sudah pernah diproses dengan data yang berbeda. Periksa kembali draf transaksi."
    );
    expect(mock().inserts).toHaveLength(0);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("terblokir + baris konflik bukan 'ai_chat' → 409 (guard lintas-alur)", async () => {
    holder.client = makeMockSupabase([
      businessOk,
      { data: storedRow({ source: "manual" }), error: null },
    ]);
    holder.rate = { allowed: false, outcome: "blocked", retryAfterSeconds: 30 };

    const res = await POST(saveRequest());
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/berbeda/i);
  });

  it("terblokir + read-back ERROR → pesan aman 500 (bukan 429 menyesatkan)", async () => {
    holder.client = makeMockSupabase([
      businessOk,
      { data: null, error: { code: "42501", message: "permission denied: RAHASIA" } },
    ]);
    holder.rate = { allowed: false, outcome: "blocked", retryAfterSeconds: 30 };

    const res = await POST(saveRequest());
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe(
      "Gagal memverifikasi percobaan sebelumnya. Silakan coba lagi."
    );
    expect(JSON.stringify(body)).not.toContain("RAHASIA");
  });

  it("mandat: lolos limit → jalur normal R2.4 (INSERT baru, replay:false)", async () => {
    holder.client = makeMockSupabase([businessOk, insertOk]);

    const res = await POST(saveRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.transactionId).toBe("tx-baru");
    expect(body.replay).toBe(false);
    expect(mock().inserts).toHaveLength(1);
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("mandat 1-2: request_id/payload tidak valid → 400 SEBELUM rate limit", async () => {
    holder.client = makeMockSupabase([]);

    const badId = await POST(saveRequest({ request_id: "bukan-uuid" }));
    expect(badId.status).toBe(400);

    const badTx = await POST(saveRequest({ transaction: { ...TX, quantity: -1 } }));
    expect(badTx.status).toBe(400);

    expect(holder.rateCalls).toEqual([]); // kuota tidak dibuang
    expect(mock().inserts).toHaveLength(0);
  });

  it("limiter fail-open (outcome 'error') → save tetap diteruskan", async () => {
    holder.rate = { allowed: true, outcome: "error", retryAfterSeconds: 1 };

    const res = await POST(saveRequest());
    expect(res.status).toBe(200);
    expect(mock().inserts).toHaveLength(1);
  });

  it("lost-response: respons sukses hilang lalu retry kena limit → tetap replay 200", async () => {
    // skenario: INSERT pertama sudah sukses di DB (request_id tercatat),
    // retry berikutnya diblokir rate limit → verifikasi replay menemukannya
    holder.client = makeMockSupabase([
      businessOk,
      { data: storedRow(), error: null },
    ]);
    holder.rate = { allowed: false, outcome: "blocked", retryAfterSeconds: 20 };

    const res = await POST(saveRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.replay).toBe(true);
    expect(body.transactionId).toBe("tx-old-1");
    expect(mock().inserts).toHaveLength(0);
  });
});
