import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeMockSupabase, type QueryResult } from "@/test/mock-supabase";

/**
 * Pengujian logging error database di /api/assistant/save (tahap 2 audit).
 *
 * Dijaga:
 * - Kegagalan INSERT transactions tercatat (kode + lokasi operasi).
 * - Log TIDAK memuat data transaksi (judul/nominal/catatan) maupun
 *   field sensitif objek error.
 * - Alur konfirmasi tetap: satu kali Simpan = satu INSERT transactions.
 */

const holder = vi.hoisted(() => ({ client: null as unknown }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => holder.client,
}));

vi.mock("@/lib/supabase/config", () => ({
  isSupabaseConfigured: () => true,
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { revalidatePath } from "next/cache";
import { POST } from "./route";

const TX = {
  type: "income",
  title: "JUDUL-TRANSAKSI-RAHASIA",
  quantity: 2,
  unit_price: 50000,
  payment_method: "cash",
  transacted_at: "2024-03-15",
  notes: "CATATAN-PRIBADI",
};

const REQUEST_ID = "c3d4e5f6-a7b8-4c9d-8e0f-1a2b3c4d5e6f";

function saveRequest(
  body: Record<string, unknown> = { transaction: TX, request_id: REQUEST_ID }
): Request {
  return new Request("http://localhost/api/assistant/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/**
 * Baris lama hasil read-back (R2.4) — setara dengan VALIDATED(TX):
 * total = 2 × 50000 = 100000 (dihitung server), 2024-03-15 12:00 WIB.
 */
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

function uniqueViolation() {
  return {
    code: "23505",
    message: "duplicate key value violates unique constraint: RAHASIA",
    details: "Key (request_id)=(RAHASIA) already exists.",
    hint: "HINT-RAHASIA",
  };
}

const businessOk: QueryResult = { data: { id: "biz-1" }, error: null };

function leakyError(code: string) {
  return {
    code,
    message: `error sistem untuk ${code}`,
    details: "Key (title)=(JUDUL-TRANSAKSI-RAHASIA) already exists.",
    hint: "HINT-RAHASIA sk-super-secret-key",
    request: { body: "LEAK-REQUEST-BODY" },
  };
}

let errorSpy: ReturnType<typeof vi.spyOn>;

function loggedText(): string {
  return errorSpy.mock.calls
    .map((call: unknown[]) => call.map((part: unknown) => String(part)).join(" "))
    .join("\n");
}

beforeEach(() => {
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(revalidatePath).mockClear();
});

afterEach(() => {
  errorSpy.mockRestore();
});

describe("POST /api/assistant/save — logging kegagalan INSERT transactions", () => {
  it("log lengkap (kode + lokasi operasi) tanpa membocorkan data transaksi", async () => {
    holder.client = makeMockSupabase([
      businessOk,
      // 23514 = kegagalan INSERT BIASA (23505 kini masuk jalur read-back R2.4)
      { data: null, error: leakyError("23514") },
    ]);

    const res = await POST(saveRequest());
    const body = await res.json();

    // Respons pengguna tetap aman & tidak berubah
    expect(res.status).toBe(500);
    expect(body.error).toBe("Gagal menyimpan transaksi ke database.");
    expect(JSON.stringify(body)).not.toContain("23514");

    // Log mencatat kode error + lokasi operasi
    const log = loggedText();
    expect(log).toContain("db_error");
    expect(log).toContain("23514");
    expect(log).toContain("transactions");
    expect(log).toContain("api/assistant/save");
    expect(log).toContain("insert");
    expect(log).toContain("konfirmasi pengguna");

    // Data transaksi & field sensitif tidak boleh masuk log
    expect(log).not.toContain("JUDUL-TRANSAKSI-RAHASIA");
    expect(log).not.toContain("CATATAN-PRIBADI");
    expect(log).not.toContain("50000");
    expect(log).not.toContain("HINT-RAHASIA");
    expect(log).not.toContain("sk-super-secret-key");
    expect(log).not.toContain("LEAK-REQUEST-BODY");

    // Kegagalan = tidak ada cache revalidation (transaksi memang tidak tersimpan)
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("POST /api/assistant/save — alur konfirmasi tetap", () => {
  it("satu kali Simpan = tepat satu INSERT transactions, tanpa error log", async () => {
    const client = makeMockSupabase([
      businessOk,
      { data: { id: "tx-1" }, error: null },
    ]);
    holder.client = client;

    const res = await POST(saveRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.transactionId).toBe("tx-1");
    expect(body.replay).toBe(false);
    expect(loggedText()).not.toContain("db_error");

    expect(client.inserts).toHaveLength(1);
    expect(client.inserts[0].table).toBe("transactions");
    // request_id klien ikut disimpan; source/status dikunci server
    const payload = client.inserts[0].payload ?? {};
    expect(payload.request_id).toBe(REQUEST_ID);
    expect(payload.source).toBe("ai_chat");
    expect(payload.status).toBe("completed");
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });
});

describe("POST /api/assistant/save — idempotency (R2.4)", () => {
  it("request_id hilang / tidak valid → 400, tanpa INSERT", async () => {
    const client = makeMockSupabase([businessOk, { data: { id: "tx-1" }, error: null }]);
    holder.client = client;

    const noId = await POST(saveRequest({ transaction: TX }));
    expect(noId.status).toBe(400);
    expect((await noId.json()).error).toBe("request_id wajib diisi.");

    const badId = await POST(
      saveRequest({ transaction: TX, request_id: "bukan-uuid" })
    );
    expect(badId.status).toBe(400);
    expect((await badId.json()).error).toBe(
      "request_id harus berupa UUID yang valid."
    );

    expect(client.inserts).toHaveLength(0);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("INSERT baru: total dihitung SERVER & business_id dari lookup server", async () => {
    const client = makeMockSupabase([
      businessOk,
      { data: { id: "tx-1" }, error: null },
    ]);
    holder.client = client;

    // browser "mengirim" total & business_id palsu — harus diabaikan
    const res = await POST(
      saveRequest({
        transaction: { ...TX, total: 1, business_id: "biz-JAHAT" },
        request_id: REQUEST_ID,
      })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.replay).toBe(false);
    const payload = client.inserts[0]?.payload ?? {};
    expect(payload.business_id).toBe("biz-1"); // dari lookup server
    expect(payload.total).toBe(100000); // 2 × 50000 — server, bukan 1
    expect(payload.quantity).toBe(2);
    expect(payload.unit_price).toBe(50000);
  });

  it("request_id sama + payload sama → replay: transactionId lama, tanpa revalidate", async () => {
    const client = makeMockSupabase([
      businessOk,
      { data: null, error: uniqueViolation() }, // insert kalah unik (23505)
      { data: storedRow(), error: null }, // read-back baris lama
    ]);
    holder.client = client;

    const res = await POST(saveRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.transactionId).toBe("tx-old-1"); // LAMA
    expect(body.replay).toBe(true);
    expect(client.inserts).toHaveLength(1); // tidak ada transaksi baru
    expect(client.updates).toHaveLength(0); // transaksi lama TIDAK diubah
    expect(revalidatePath).not.toHaveBeenCalled(); // replay = tanpa revalidate
  });

  it("request_id sama + payload BERBEDA → ditolak 409, tanpa baris baru", async () => {
    const client = makeMockSupabase([
      businessOk,
      { data: null, error: uniqueViolation() },
      { data: storedRow({ total: "99999" }), error: null }, // total beda
    ]);
    holder.client = client;

    const res = await POST(saveRequest());
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toBe(
      "Permintaan ini sudah pernah diproses dengan data yang berbeda. Periksa kembali draf transaksi."
    );
    expect(client.inserts).toHaveLength(1);
    expect(client.updates).toHaveLength(0);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("read-back setelah 23505 GAGAL → pesan aman, tanpa revalidate", async () => {
    const client = makeMockSupabase([
      businessOk,
      { data: null, error: uniqueViolation() },
      { data: null, error: { code: "42501", message: "permission denied: RAHASIA" } },
    ]);
    holder.client = client;

    const res = await POST(saveRequest());
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe(
      "Gagal memverifikasi percobaan sebelumnya. Silakan coba lagi."
    );
    expect(JSON.stringify(body)).not.toContain("RAHASIA");
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("read-back setelah 23505 → baris tidak ditemukan → pesan aman", async () => {
    const client = makeMockSupabase([
      businessOk,
      { data: null, error: uniqueViolation() },
      { data: null, error: null },
    ]);
    holder.client = client;

    const res = await POST(saveRequest());
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe(
      "Gagal memverifikasi percobaan sebelumnya. Silakan coba lagi."
    );
  });

  it("baris konflik source-nya BUKAN ai_chat → ditolak sebagai payload berbeda", async () => {
    const client = makeMockSupabase([
      businessOk,
      { data: null, error: uniqueViolation() },
      { data: storedRow({ source: "pos" }), error: null },
    ]);
    holder.client = client;

    const res = await POST(saveRequest());
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/berbeda/i);
    expect(client.updates).toHaveLength(0);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("tidak ada service_role: pemanggilan hanya via client yang login", async () => {
    const client = makeMockSupabase([
      businessOk,
      { data: { id: "tx-1" }, error: null },
    ]);
    client.auth.getUser = async () => ({ data: { user: null } });
    holder.client = client;

    const res = await POST(saveRequest());
    expect(res.status).toBe(401);
    expect(client.inserts).toHaveLength(0);
  });
});
