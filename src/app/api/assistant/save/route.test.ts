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

function saveRequest(): Request {
  return new Request("http://localhost/api/assistant/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transaction: TX }),
  });
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
      { data: null, error: leakyError("23505") },
    ]);

    const res = await POST(saveRequest());
    const body = await res.json();

    // Respons pengguna tetap aman & tidak berubah
    expect(res.status).toBe(500);
    expect(body.error).toBe("Gagal menyimpan transaksi ke database.");
    expect(JSON.stringify(body)).not.toContain("23505");

    // Log mencatat kode error + lokasi operasi
    const log = loggedText();
    expect(log).toContain("db_error");
    expect(log).toContain("23505");
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
    expect(loggedText()).not.toContain("db_error");

    expect(client.inserts).toHaveLength(1);
    expect(client.inserts[0].table).toBe("transactions");
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });
});
