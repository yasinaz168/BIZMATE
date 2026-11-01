import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeMockSupabase, type QueryResult } from "@/test/mock-supabase";

/**
 * Pengujian Server Action buat transaksi manual (P5.4.4 + idempotency R2.2).
 *
 * Dijaga:
 * - Sukses → INSERT hanya field yang diperlukan; total dihitung server;
 *   source SELALU "manual"; status SELALU "completed"; business_id dari
 *   lookup server (browser TIDAK bisa memanipulasinya).
 * - request_id diterima dari FormData dan menjadi kunci idempotency
 *   (dibuat klien; server tidak membuat).
 * - Konflik 23505 → read-back: payload sama = replay (tanpa baris baru,
 *   tanpa revalidatePath, tanpa mengubah transaksi lama); payload beda =
 *   DITOLAK.
 * - Input tidak valid / belum login / bisnis tidak ada → ditolak TANPA
 *   INSERT.
 * - Error database → pesan aman (tanpa detail internal), tanpa throw.
 * - Revalidate /transaksi, /dashboard, /laporan HANYA untuk transaksi baru.
 */

const holder = vi.hoisted(() => ({ client: null as unknown }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => holder.client,
}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { revalidatePath } from "next/cache";
import { createManualTransactionAction } from "./actions";

const REQUEST_ID = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
const REQUEST_ID_2 = "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e";

const businessOk: QueryResult = { data: { id: "biz-1" }, error: null };
const insertOk: QueryResult = { data: { id: "tx-new-1" }, error: null };

/** Error DB tiruan — memuat field sensitif yang TIDAK boleh bocor */
function dbError(code: string, message: string) {
  return {
    code,
    message,
    details: "RAHASIA-DETAIL-XYZ",
    hint: "RAHASIA-HINT-XYZ",
  };
}

/** Konflik unique partial index (business_id, request_id) — SQLSTATE 23505 */
function uniqueViolation() {
  return dbError("23505", "duplicate key value violates unique constraint: RAHASIA");
}

/** Baris lama hasil read-back (kolom READBACK_COLUMNS + id) */
function storedRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "tx-old-1",
    source: "manual",
    type: "income",
    title: "Penjualan gula 5 kg",
    quantity: "5",
    unit_price: "12500",
    total: "62500",
    transacted_at: "2020-01-15T05:00:00.000Z", // 2020-01-15 12:00 WIB
    payment_method: "cash",
    notes: null,
    ...overrides,
  };
}

function validForm(fields: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.set("type", "income");
  fd.set("title", "Penjualan gula 5 kg");
  fd.set("quantity", "5");
  fd.set("unit_price", "12500");
  fd.set("payment_method", "cash");
  fd.set("transacted_at", "2020-01-15");
  fd.set("notes", "");
  fd.set("request_id", REQUEST_ID);
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

beforeEach(() => {
  holder.client = makeMockSupabase([]);
  vi.mocked(revalidatePath).mockClear();
});

afterEach(() => {
  vi.mocked(revalidatePath).mockClear();
});

describe("createManualTransactionAction — sukses (INSERT baru)", () => {
  it("pemasukan valid → insert sesuai kontrak + revalidate", async () => {
    const client = makeMockSupabase([businessOk, insertOk]);
    holder.client = client;

    const res = await createManualTransactionAction(null, validForm());

    expect(res).toEqual({ ok: true, transactionId: "tx-new-1", replay: false });
    expect(client.inserts).toHaveLength(1);

    const insert = client.inserts[0];
    expect(insert.table).toBe("transactions");

    const payload = insert.payload ?? {};
    expect(Object.keys(payload)).toEqual([
      "business_id",
      "type",
      "title",
      "quantity",
      "unit_price",
      "total",
      "transacted_at",
      "payment_method",
      "source",
      "status",
      "notes",
      "request_id",
    ]);

    // business_id dari lookup server; total dihitung server; konstanta server
    expect(payload.business_id).toBe("biz-1");
    expect(payload.type).toBe("income");
    expect(payload.title).toBe("Penjualan gula 5 kg");
    expect(payload.quantity).toBe(5);
    expect(payload.unit_price).toBe(12500);
    expect(payload.total).toBe(62500); // 5 × 12500 — server
    // 2020-01-15 pukul 12:00 WIB → ISO UTC 05:00 (hari yang sama)
    expect(payload.transacted_at).toBe("2020-01-15T05:00:00.000Z");
    expect(payload.payment_method).toBe("cash");
    expect(payload.source).toBe("manual");
    expect(payload.status).toBe("completed");
    expect(payload.notes).toBeNull();
    // request_id dari klien — kunci idempotency
    expect(payload.request_id).toBe(REQUEST_ID);

    expect(revalidatePath).toHaveBeenCalledWith("/transaksi");
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
    expect(revalidatePath).toHaveBeenCalledWith("/laporan");
  });

  it("pengeluaran valid → source tetap manual, status completed, notes terisi", async () => {
    const client = makeMockSupabase([businessOk, insertOk]);
    holder.client = client;

    const res = await createManualTransactionAction(
      null,
      validForm({
        type: "expense",
        title: "Sewa ruko",
        quantity: "1",
        unit_price: "3500000",
        payment_method: "transfer",
        notes: "  okt-okt  " + " ",
      })
    );

    expect(res).toEqual({ ok: true, transactionId: "tx-new-1", replay: false });
    const payload = client.inserts[0]?.payload ?? {};
    expect(payload.type).toBe("expense");
    expect(payload.source).toBe("manual");
    expect(payload.status).toBe("completed");
    expect(payload.payment_method).toBe("transfer");
    expect(payload.notes).toBe("okt-okt"); // trim
    expect(payload.total).toBe(3500000);
  });

  it("kolom isian browser (business_id/total/source/status) TIDAK memengaruhi payload", async () => {
    const client = makeMockSupabase([businessOk, insertOk]);
    holder.client = client;

    const res = await createManualTransactionAction(
      null,
      validForm({
        business_id: "biz-JAHAT",
        total: "1",
        source: "pos",
        status: "draft",
      })
    );

    expect(res).toEqual({ ok: true, transactionId: "tx-new-1", replay: false });
    const payload = client.inserts[0]?.payload ?? {};
    expect(payload.business_id).toBe("biz-1");
    expect(payload.total).toBe(62500);
    expect(payload.source).toBe("manual");
    expect(payload.status).toBe("completed");
    // request_id SAH dikirim klien (memang kuncinya) — nilai lain tetap server
    expect(payload.request_id).toBe(REQUEST_ID);
    expect(payload).not.toHaveProperty("id");
  });

  it("request_id berbeda = transaksi berbeda (tidak memicu replay)", async () => {
    const client = makeMockSupabase([businessOk, insertOk]);
    holder.client = client;

    const res = await createManualTransactionAction(
      null,
      validForm({ request_id: REQUEST_ID_2 })
    );

    expect(res).toEqual({ ok: true, transactionId: "tx-new-1", replay: false });
    expect(client.inserts[0]?.payload?.request_id).toBe(REQUEST_ID_2);
  });
});

describe("createManualTransactionAction — idempotency (R2.2)", () => {
  it("request_id sama + payload sama → replay: transactionId lama, tanpa revalidate", async () => {
    const client = makeMockSupabase([
      businessOk,
      { data: null, error: uniqueViolation() }, // insert kalah unik (23505)
      { data: storedRow(), error: null }, // read-back baris lama
    ]);
    holder.client = client;

    const res = await createManualTransactionAction(null, validForm());

    expect(res).toEqual({ ok: true, transactionId: "tx-old-1", replay: true });
    // tidak ada transaksi baru yang disimpan
    expect(client.inserts).toHaveLength(1); // hanya percobaan insert yang kalah
    // transaksi lama TIDAK diubah
    expect(client.updates).toHaveLength(0);
    // replay TIDAK memanggil revalidatePath (pola POS)
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("request_id sama + payload BERBEDA → ditolak, tanpa baris baru & tanpa revalidate", async () => {
    const client = makeMockSupabase([
      businessOk,
      { data: null, error: uniqueViolation() },
      { data: storedRow({ total: "99999" }), error: null }, // total beda
    ]);
    holder.client = client;

    const res = await createManualTransactionAction(null, validForm());

    expect(res?.ok).toBe(false);
    if (!res?.ok) {
      expect(res?.error).toBe(
        "Permintaan ini sudah pernah diproses dengan data yang berbeda. Periksa kembali isian formulir."
      );
    }
    expect(client.inserts).toHaveLength(1); // hanya percobaan yang kalah
    expect(client.updates).toHaveLength(0); // tidak menyentuh baris lama
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("payload beda pada notes (null vs terisi) juga ditolak", async () => {
    const client = makeMockSupabase([
      businessOk,
      { data: null, error: uniqueViolation() },
      { data: storedRow({ notes: "beda" }), error: null },
    ]);
    holder.client = client;

    const res = await createManualTransactionAction(null, validForm({ notes: "lain" }));
    expect(res?.ok).toBe(false);
  });

  it("read-back setelah 23505 → error → pesan aman, tanpa revalidate", async () => {
    const client = makeMockSupabase([
      businessOk,
      { data: null, error: uniqueViolation() },
      { data: null, error: dbError("42501", "permission denied: RAHASIA") },
    ]);
    holder.client = client;

    const res = await createManualTransactionAction(null, validForm());

    expect(res?.ok).toBe(false);
    if (!res?.ok) {
      expect(res?.error).toBe(
        "Gagal memverifikasi percobaan sebelumnya. Silakan coba lagi."
      );
      expect(res?.error).not.toMatch(/RAHASIA|42501|permission/i);
    }
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("read-back setelah 23505 → data lama tidak ditemukan → pesan aman", async () => {
    const client = makeMockSupabase([
      businessOk,
      { data: null, error: uniqueViolation() },
      { data: null, error: null }, // maybeSingle tanpa baris
    ]);
    holder.client = client;

    const res = await createManualTransactionAction(null, validForm());

    expect(res?.ok).toBe(false);
    if (!res?.ok) {
      expect(res?.error).toBe(
        "Gagal memverifikasi percobaan sebelumnya. Silakan coba lagi."
      );
    }
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("baris konflik ternyata bukan sumber 'manual' → dianggap payload berbeda", async () => {
    const client = makeMockSupabase([
      businessOk,
      { data: null, error: uniqueViolation() },
      { data: storedRow({ source: "pos" }), error: null },
    ]);
    holder.client = client;

    const res = await createManualTransactionAction(null, validForm());
    expect(res?.ok).toBe(false);
    if (!res?.ok) expect(res?.error).toMatch(/berbeda/i);
    expect(client.updates).toHaveLength(0);
  });
});

describe("createManualTransactionAction — penolakan", () => {
  it("belum login → tolak tanpa menyentuh tables", async () => {
    const client = makeMockSupabase([]);
    client.auth.getUser = async () => ({ data: { user: null } });
    holder.client = client;

    const res = await createManualTransactionAction(null, validForm());

    expect(res?.ok).toBe(false);
    if (!res?.ok) expect(res?.error).toMatch(/sesi/i);
    expect(client.inserts).toHaveLength(0);
  });

  it("bisnis belum ada → tolak dengan jelas, tanpa INSERT", async () => {
    const client = makeMockSupabase([{ data: null, error: null }]);
    holder.client = client;

    const res = await createManualTransactionAction(null, validForm());

    expect(res?.ok).toBe(false);
    if (!res?.ok) expect(res?.error).toMatch(/profil bisnis belum ada/i);
    expect(client.inserts).toHaveLength(0);
  });

  it("input tidak valid → daftar fieldErrors, tanpa INSERT", async () => {
    const client = makeMockSupabase([businessOk, insertOk]);
    holder.client = client;

    const res = await createManualTransactionAction(
      null,
      validForm({ quantity: "-3", unit_price: "abc", type: "refund", payment_method: "kartu", transacted_at: "2099-01-01" })
    );

    expect(res?.ok).toBe(false);
    if (!res?.ok) expect(res?.fieldErrors?.length).toBeGreaterThan(0);
    expect(client.inserts).toHaveLength(0);
  });

  it("request_id tidak valid (bukan UUID) → ditolak sebelum INSERT", async () => {
    const client = makeMockSupabase([businessOk, insertOk]);
    holder.client = client;

    const res = await createManualTransactionAction(
      null,
      validForm({ request_id: "bukan-uuid" })
    );

    expect(res?.ok).toBe(false);
    if (!res?.ok) {
      expect(res?.fieldErrors).toContain(
        "request_id harus berupa UUID yang valid."
      );
    }
    expect(client.inserts).toHaveLength(0);
  });

  it("error INSERT database (bukan 23505) → pesan generik umum TANPA detail internal", async () => {
    const client = makeMockSupabase([
      businessOk,
      { data: null, error: dbError("23514", "check constraint violated: RAHASIA") },
    ]);
    holder.client = client;

    const res = await createManualTransactionAction(null, validForm());

    expect(res?.ok).toBe(false);
    if (!res?.ok) {
      expect(res?.error).toBe("Gagal menyimpan transaksi. Silakan coba lagi.");
      expect(res?.error).not.toMatch(/RAHASIA|violated|23514/i);
      expect(res?.fieldErrors).toBeUndefined();
    }
  });

  it("lookup bisnis gagal (db error) → pesan berbeda dari 'belum ada'", async () => {
    const client = makeMockSupabase([
      { data: null, error: dbError("42501", "permission denied: RAHASIA") },
    ]);
    holder.client = client;

    const res = await createManualTransactionAction(null, validForm());

    expect(res?.ok).toBe(false);
    if (!res?.ok) {
      expect(res?.error).toBe("Gagal memuat data bisnis. Silakan coba lagi.");
      expect(res?.error).not.toMatch(/RAHASIA|permission|42501/i);
    }
    expect(client.inserts).toHaveLength(0);
  });

  it("INSERT sukses tetapi id kosong → tetap pesan aman", async () => {
    const client = makeMockSupabase([
      businessOk,
      { data: {}, error: null } as QueryResult,
    ]);
    holder.client = client;

    const res = await createManualTransactionAction(null, validForm());

    expect(res?.ok).toBe(false);
    if (!res?.ok) {
      expect(res?.error).toBe("Gagal menyimpan transaksi. Silakan coba lagi.");
    }
  });
});
