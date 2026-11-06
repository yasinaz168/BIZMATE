import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeMockSupabase, type QueryResult } from "@/test/mock-supabase";

/**
 * P4.2 — pengujian server action hapus percakapan:
 * - Sukses: delete dengan isolasi `.eq("business_id") + .eq("id")`,
 *   distinct hasil "deleted" vs "not_found" (returning).
 * - Ownership/business_id dari SERVER; guard UUID tanpa menyentuh DB.
 * - Error DB → pesan aman.
 * - TRANSAKSI TIDAK disentuh: tidak ada insert/update/delete pada
 *   `transactions`/`transaction_items` — hanya tabel AI.
 * - Tanpa service_role.
 */

const holder = vi.hoisted(() => ({ client: null as unknown }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => holder.client,
}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { revalidatePath } from "next/cache";
import { deleteConversationAction } from "./actions";

const userOk = { user: { id: "user-1" } };
const businessOk: QueryResult = { data: { id: "biz-1" }, error: null };
const deleteOk: QueryResult = { data: { id: "conv-1" }, error: null };
const DELETE_ID = "9a1b2c3d-4444-4abc-8d9e-000000000001";

function dbError(code: string, message: string) {
  return {
    code,
    message: `RAHASIA: ${message}`,
    details: "RAHASIA-DETAIL",
    hint: "HINT-RAHASIA",
  };
}

beforeEach(() => {
  holder.client = makeMockSupabase([]);
  vi.mocked(revalidatePath).mockClear();
});

afterEach(() => {
  vi.mocked(revalidatePath).mockClear();
});

describe("deleteConversationAction — sukses & pemisahan status (P4.2)", () => {
  it("sukses dihapus → status 'deleted' + revalidate /assistant", async () => {
    const client = makeMockSupabase([businessOk, deleteOk]);
    holder.client = client;

    const res = await deleteConversationAction(DELETE_ID);

    expect(res).toEqual({ status: "deleted", id: "conv-1" });
    // hanya DELETE — TANPA insert/update apa pun (transaksi aman)
    expect(client.inserts).toHaveLength(0);
    expect(client.updates).toHaveLength(0);
    expect(revalidatePath).toHaveBeenCalledWith("/assistant");
  });

  it("baris tidak ada → status 'not_found', pesan tidak ditolak keras", async () => {
    const client = makeMockSupabase([
      businessOk,
      { data: null, error: null }, // returning kosong
    ]);
    holder.client = client;

    const res = await deleteConversationAction(DELETE_ID);

    expect(res).toEqual({ status: "not_found", id: DELETE_ID });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("ownership/scoping: business_id + id dikunci via .eq dua-duanya", async () => {
    const source = readFileSync(
      fileURLToPath(new URL("./actions.ts", import.meta.url)),
      "utf8"
    );
    // urutan isolasi: business_id dulu, lalu id — keduanya WAJIB berdampingan
    const idx = source.indexOf('.eq("business_id", lookup.businessId)');
    const idxId = source.indexOf('.eq("id", conversationId.trim())');
    expect(idx).toBeGreaterThan(-1);
    expect(idxId).toBeGreaterThan(idx);
  });
});

describe("deleteConversationAction — penolakan", () => {
  it("belum login → error sesi, TANPA menyentuh DB", async () => {
    const client = makeMockSupabase([]);
    client.auth.getUser = async () => ({ data: { user: null } });
    holder.client = client;

    const res = await deleteConversationAction(DELETE_ID);
    expect(res.status).toBe("error");
    if (res.status === "error") expect(res.message).toMatch(/sesi/i);
  });

  it("id bukan UUID → 'not_found' TANPA query DB (guard sebelum DB)", async () => {
    const client = makeMockSupabase([]);
    client.from = () => {
      throw new Error("TIDAK BOLEH query bila id tidak valid");
    };
    holder.client = client;

    const res = await deleteConversationAction("bukan-uuid");
    expect(res.status).toBe("not_found");
  });

  it("bisnis belum ada → error jelas, TANPA delete", async () => {
    const client = makeMockSupabase([{ data: null, error: null }]);
    holder.client = client;

    const res = await deleteConversationAction(DELETE_ID);
    expect(res.status).toBe("error");
    if (res.status === "error") {
      expect(res.message).toMatch(/profil bisnis belum ada/i);
    }
  });

  it("error DB delete → pesan aman TANPA detail internal", async () => {
    const client = makeMockSupabase([
      businessOk,
      {
        data: null,
        error: dbError("42501", "permission denied atau Speaker rahasia"),
      },
    ]);
    holder.client = client;

    const res = await deleteConversationAction(DELETE_ID);
    expect(res.status).toBe("error");
    if (res.status === "error") {
      expect(res.message).toBe(
        "Gagal menghapus percakapan. Silakan coba lagi."
      );
      expect(res.message).not.toContain("RAHASIA");
    }
  });
});

describe("deleteConversationAction — transaksi & POS aman (kontrak fs)", () => {
  it("actions.ts TIDAK menyentuh tabel transaksi/produk sama sekali", () => {
    const source = readFileSync(
      fileURLToPath(new URL("./actions.ts", import.meta.url)),
      "utf8"
    );
    expect(source).not.toContain('"transactions"');
    expect(source).not.toContain('"transaction_items"');
    expect(source).not.toContain('"products"');
    expect(source).not.toContain("create_sale");
    // tanpa service_role: admin client / env service key tidak pernah dipakai
    expect(source).not.toContain("supabase.auth.admin");
    expect(source).not.toContain("createAdminClient");
    expect(source).not.toContain("SUPABASE_SERVICE_ROLE");
  });

  it("migration 00007 tidak mengubah transactions maupun policies AI", () => {
    const migration = readFileSync(
      fileURLToPath(
        new URL("../../../../supabase/migrations/00007_conversation_management.sql", import.meta.url)
      ),
      "utf8"
    );
    expect(migration).not.toContain('"transactions"');
    expect(migration).not.toContain("transaction_items");
    expect(migration).not.toContain("drop policy");
    expect(migration).not.toContain("create policy");
    expect(migration).not.toContain("enable row level security");
    expect(migration).toContain("add column if not exists archived_at");
    expect(migration).toContain(
      "grant select, insert, update, delete"
    );
  });

  it("cascade FK ai_messages menjamin pesan ikut terhapus tanpa policy ekstra", () => {
    const m1 = readFileSync(
      fileURLToPath(
        new URL("../../../../supabase/migrations/00001_core_schema.sql", import.meta.url)
      ),
      "utf8"
    );
    expect(m1).toContain(
      "references public.ai_conversations (id) on delete cascade"
    );
  });
});
