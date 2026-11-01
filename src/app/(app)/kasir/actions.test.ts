import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeMockSupabase, type QueryResult } from "@/test/mock-supabase";

/**
 * Pengujian Server Action checkout POS (Tahap P5.2).
 *
 * Dijaga:
 * - Checkout sukses → rpc create_sale dipanggil SESUAI KONTRAK SQL 00005
 *   (hanya p_request_id, p_payment_method, p_items, p_notes — tanpa
 *   business_id/harga/total/stok dari browser) + revalidate halaman.
 * - Belum login / bisnis tidak ada / input tidak valid → ditolak TANPA
 *   memanggil RPC.
 * - RPC replay → idempotent_replay = true dikembalikan.
 * - RPC gagal / respons malformed → pesan aman, tanpa detail internal.
 * - request_id DITERIMA dari klien — server tidak membuat ulang.
 */

const holder = vi.hoisted(() => ({ client: null as unknown }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => holder.client,
}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { revalidatePath } from "next/cache";
import { createSaleAction } from "./actions";

const REQUEST_ID = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
const OTHER_REQUEST_ID = "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e";
const UUID_1 = "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e";
const UUID_2 = "c3d4e5f6-a7b8-4c9d-8e0f-2a3b4c5d6e7f";

const SAFE_SALE = {
  transaction_id: "11111111-2222-4333-8444-555555555555",
  total: 130000,
  item_count: 2,
  total_quantity: 3,
  idempotent_replay: false,
};

const businessOk: QueryResult = { data: { id: "biz-1" }, error: null };

/** Error DB tiruan milik RPC — harus tidak bocorkan details/hint */
function rpcError(code: string, message: string) {
  return {
    code,
    message,
    details: "RAHASIA-DETAIL-XYZ",
    hint: "RAHASIA-HINT-XYZ",
    request_id: null as unknown,
  };
}

function checkoutForm(fields: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.set("request_id", REQUEST_ID);
  fd.set("payment_method", "cash");
  fd.set("items", JSON.stringify([
    { product_id: UUID_1, quantity: 2 },
    { product_id: UUID_2, quantity: 1 },
  ]));
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

describe("createSaleAction — checkout sukses & kontrak RPC", () => {
  it("sukses → rpc create_sale dipanggil persis kontrak SQL 00005", async () => {
    const client = makeMockSupabase([businessOk, { data: null, error: null }]);
    client.rpcResult = { data: SAFE_SALE, error: null };
    holder.client = client;

    const res = await createSaleAction(null, checkoutForm({ notes: "  bungkus dua  " }));

    expect(res.error).toBeUndefined();
    expect(res.success).toContain("berhasil");
    expect(res.sale).toEqual(SAFE_SALE);

    expect(client.rpcs).toHaveLength(1);
    const call = client.rpcs[0];
    expect(call.name).toBe("create_sale");
    expect(call.args).toEqual({
      p_request_id: REQUEST_ID,
      p_payment_method: "cash",
      p_items: [
        { product_id: UUID_1, quantity: 2 },
        { product_id: UUID_2, quantity: 1 },
      ],
      p_notes: "bungkus dua",
    });
    // Kontrak SQL: hanya 4 parameter, urut sesuai signature 00005
    expect(Object.keys(call.args ?? {})).toEqual([
      "p_request_id",
      "p_payment_method",
      "p_items",
      "p_notes",
    ]);
    // Item hanya product_id + quantity — tanpa harga/nama/stok dari browser
    for (const item of (call.args?.p_items ?? []) as Array<Record<string, unknown>>) {
      expect(Object.keys(item)).toEqual(["product_id", "quantity"]);
    }
    expect(revalidatePath).toHaveBeenCalledWith("/kasir");
    expect(revalidatePath).toHaveBeenCalledWith("/produk");
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("business_id dari browser diabaikan (RPC menyentuh 4 parameter saja)", async () => {
    const client = makeMockSupabase([businessOk, { data: null, error: null }]);
    client.rpcResult = { data: SAFE_SALE, error: null };
    holder.client = client;

    const res = await createSaleAction(
      null,
      checkoutForm({ business_id: "hack-id-milik-orang-lain" })
    );
    expect(res.success).toBeDefined();
    const argsJson = JSON.stringify(client.rpcs[0]);
    expect(argsJson).not.toContain("hack-id-milik-orang-lain");
  });

  it("retry mempertahankan request_id yang sama (server tidak membuat ulang)", async () => {
    const client = makeMockSupabase([businessOk, businessOk]);
    client.rpcResult = { data: SAFE_SALE, error: null };
    holder.client = client;

    await createSaleAction(null, checkoutForm());
    const pertama = client.rpcs[0].args?.p_request_id;
    await createSaleAction(null, checkoutForm());
    const kedua = client.rpcs[1].args?.p_request_id;

    expect(pertama).toBe(REQUEST_ID);
    expect(kedua).toBe(REQUEST_ID);
    expect(client.rpcs).toHaveLength(2);
  });
});

describe("createSaleAction — penolakan sebelum RPC", () => {
  it("pengguna tidak login → ditolak tanpa RPC", async () => {
    const client = makeMockSupabase([]);
    client.auth.getUser = async () => ({ data: { user: null } });
    holder.client = client;

    const res = await createSaleAction(null, checkoutForm());
    expect(res.error).toBe("Sesi berakhir. Silakan login ulang.");
    expect(client.rpcs).toHaveLength(0);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("bisnis tidak ditemukan → ditolak tanpa RPC", async () => {
    holder.client = makeMockSupabase([{ data: null, error: null }]);
    const res = await createSaleAction(null, checkoutForm());
    expect(res.error).toContain("Profil bisnis belum ada");
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("lookup bisnis gagal (DB error) → pesan kegagalan DB, bukan 'bisnis belum ada'", async () => {
    holder.client = makeMockSupabase([
      { data: null, error: { code: "42501", message: "permission denied for table businesses" } },
    ]);
    const res = await createSaleAction(null, checkoutForm());
    expect(res.error).toBe("Gagal memuat data bisnis. Silakan coba lagi.");
    expect(res.error).not.toContain("Profil bisnis belum ada");
    expect(res.error).not.toContain("42501");
    expect(res.error).not.toContain("permission denied");
  });

  it("input tidak valid → ditolak tanpa RPC", async () => {
    holder.client = makeMockSupabase([businessOk, { data: null, error: null }]);
    const res = await createSaleAction(
      null,
      checkoutForm({
        request_id: "bukan-uuid",
        items: JSON.stringify([{ product_id: UUID_1, quantity: -2 }]),
      })
    );
    expect(res.error).toContain("request_id harus berupa UUID yang valid.");
    expect(res.error).toContain("Item ke-1: quantity harus lebih besar dari 0.");
    const client = holder.client as ReturnType<typeof makeMockSupabase>;
    expect(client.rpcs).toHaveLength(0);
  });
});

describe("createSaleAction — kegagalan RPC", () => {
  it("stok tidak cukup (pesan dikenal) → dilempar apa adanya ke kasir", async () => {
    const client = makeMockSupabase([businessOk, { data: null, error: null }]);
    client.rpcResult = {
      data: null,
      error: rpcError("P0001", "Stok Kopi Bubuk tidak mencukupi (tersisa 3)."),
    };
    holder.client = client;

    const res = await createSaleAction(null, checkoutForm());
    expect(res.error).toBe("Stok Kopi Bubuk tidak mencukupi (tersisa 3).");
    expect(res.error).not.toContain("RAHASIA-DETAIL-XYZ");
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("gagal RPC yang tidak bisa diidentifikasi aman → pesan generik TANPA detail", async () => {
    const client = makeMockSupabase([businessOk, { data: null, error: null }]);
    client.rpcResult = {
      data: null,
      error: {
        code: "XX000",
        message: "connection terminated unexpectedly RAHASIA-DETAIL-XYZ",
      },
    };
    holder.client = client;

    const res = await createSaleAction(null, checkoutForm());
    expect(res.error).toBe("Checkout gagal. Silakan coba lagi.");
    expect(res.error).not.toContain("connection terminated");
    expect(res.error).not.toContain("RAHASIA");
  });

  it("respons RPC malformed → pesan generik + dicatat logAppError", async () => {
    const client = makeMockSupabase([businessOk, { data: null, error: null }]);
    client.rpcResult = { data: "bukan-objek", error: null };
    holder.client = client;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const res = await createSaleAction(null, checkoutForm());
      expect(res.error).toBe("Checkout gagal. Silakan coba lagi.");
      const log = errorSpy.mock.calls
        .map((call: unknown[]) => call.map((part: unknown) => String(part)).join(" "))
        .join("\n");
      expect(log).toContain("app_error");
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("detail field sensitif error RPC tidak bocor ke log maupun pesan", async () => {
    const client = makeMockSupabase([businessOk, { data: null, error: null }]);
    client.rpcResult = {
      data: null,
      error: rpcError("P0001", "Stok Kopi tidak mencukupi (tersisa 3)."),
    };
    holder.client = client;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await createSaleAction(null, checkoutForm());
      const log = errorSpy.mock.calls
        .map((call: unknown[]) => call.map((part: unknown) => String(part)).join(" "))
        .join("\n");
      expect(log).toContain("db_error");
      expect(log).toContain("create_sale");
      expect(log).not.toContain("RAHASIA-DETAIL-XYZ");
      expect(log).not.toContain("RAHASIA-HINT-XYZ");
    } finally {
      errorSpy.mockRestore();
    }
  });
});

describe("createSaleAction — idempotency (RPC replay)", () => {
  it("RPC mengembalikan replay → success dengan idempotent_replay true", async () => {
    const client = makeMockSupabase([businessOk, { data: null, error: null }]);
    client.rpcResult = {
      data: { ...SAFE_SALE, idempotent_replay: true },
      error: null,
    };
    holder.client = client;

    const res = await createSaleAction(null, checkoutForm());
    expect(res.error).toBeUndefined();
    expect(res.success).toContain("sudah pernah diproses");
    expect(res.sale?.idempotent_replay).toBe(true);
    expect(res.sale?.transaction_id).toBe(SAFE_SALE.transaction_id);
  });
});

describe("createSaleAction — lintasan keamanan kasir/actions.ts", () => {
  it("menulis via RPC create_sale, tanpa service_role/getSession/delete/insert direct/bisnis id browser", () => {
    const source = readFileSync(fileURLToPath(new URL("./actions.ts", import.meta.url)), "utf8");
    expect(source).toContain('RPC_NAME = "create_sale"');
    expect(source).toMatch(/supabase\.rpc\(\s*RPC_NAME/);
    expect(source).not.toMatch(/service_role/i);
    expect(source).not.toMatch(/getSession\(/);
    expect(source).not.toMatch(/\.delete\(/);
    expect(source).not.toMatch(/\.truncate\(/);
    // POS TIDAK menulis tabel transaksi langsung — melalui RPC
    expect(source).not.toMatch(/from\("transactions"\)/);
    expect(source).not.toMatch(/from\("transaction_items"\)/);
    expect(source).not.toMatch(/\.insert\(/);
    expect(source).not.toMatch(/formData\.get\("business_id"\)/);
  });
});
