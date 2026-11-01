import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeMockSupabase, type QueryResult } from "@/test/mock-supabase";

/**
 * Pengujian Server Actions Product Management (Tahap P2).
 *
 * Dijaga:
 * - Pengguna tidak login → ditolak.
 * - Validasi gagal → pesan validasi Bahasa Indonesia.
 * - Produk tidak ditemukan / bukan milik bisnis → ditolak.
 * - Kegagalan database → pesan generik TANPA detail internal.
 * - business_id berasal dari lookup server, BUKAN input browser.
 * - update TIDAK menyentuh is_active; toggle hanya mengubah is_active.
 * - Tidak ada operasi DELETE / service_role.
 */

const holder = vi.hoisted(() => ({ client: null as unknown }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => holder.client,
}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { revalidatePath } from "next/cache";
import { createProductAction, setProductActiveAction, updateProductAction } from "./actions";

const businessOk: QueryResult = { data: { id: "biz-1" }, error: null };
const insertOk: QueryResult = { data: null, error: null };
const updateOk: QueryResult = { data: { id: "prod-1" }, error: null };

/** Error DB tiruan yang membawa detail sensitif — tidak boleh bocor ke user */
function leakyDbError() {
  return {
    code: "42501",
    message: "permission denied for table products",
    details: "RAHASIA-DB-DETAIL",
    hint: "GRANT SELECT ON public.products TO anon",
  };
}

function productForm(fields: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.set("name", "Kopi Bubuk 250gr");
  fd.set("category", "Makanan");
  fd.set("selling_price", "45000");
  fd.set("unit_cost", "30000");
  fd.set("stock", "12");
  fd.set("unit", "pack");
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

describe("createProductAction", () => {
  it("pengguna tidak login → ditolak", async () => {
    const client = makeMockSupabase([]);
    client.auth.getUser = async () => ({ data: { user: null } });
    holder.client = client;

    const res = await createProductAction(null, productForm());
    expect(res.error).toBe("Sesi berakhir. Silakan login ulang.");
    expect(client.inserts).toHaveLength(0);
  });

  it("validasi gagal → pesan validasi Bahasa Indonesia, tanpa insert", async () => {
    holder.client = makeMockSupabase([businessOk, insertOk]);
    const res = await createProductAction(null, productForm({ name: "", selling_price: "-5" }));
    expect(res.error).toContain("Nama produk wajib diisi.");
    expect(res.error).toContain("Harga jual tidak boleh negatif.");
    expect((holder.client as ReturnType<typeof makeMockSupabase>).inserts).toHaveLength(0);
  });

  it("bisnis belum ada → ditolak dengan pesan jelas", async () => {
    holder.client = makeMockSupabase([{ data: null, error: null }, insertOk]);
    const res = await createProductAction(null, productForm());
    expect(res.error).toContain("Profil bisnis belum ada");
  });

  it("sukses → insert ke products + revalidatePath", async () => {
    const client = makeMockSupabase([businessOk, insertOk]);
    holder.client = client;

    const res = await createProductAction(null, productForm());
    expect(res.success).toBe("Produk berhasil ditambahkan.");
    expect(client.inserts).toHaveLength(1);
    expect(client.inserts[0].table).toBe("products");
    expect(client.inserts[0].payload?.name).toBe("Kopi Bubuk 250gr");
    expect(client.inserts[0].payload?.selling_price).toBe(45000);
    expect(revalidatePath).toHaveBeenCalledWith("/produk");
  });

  it("business_id dari browser DIABAIKAN — memakai hasil lookup server", async () => {
    const client = makeMockSupabase([businessOk, insertOk]);
    holder.client = client;

    // Penyelundupan business_id lewat form harus tidak berpengaruh
    const res = await createProductAction(
      null,
      productForm({ business_id: "hack-id-milik-orang-lain" })
    );
    expect(res.success).toBeDefined();
    expect(client.inserts[0].payload?.business_id).toBe("biz-1");
    expect(client.inserts[0].payload?.business_id).not.toBe("hack-id-milik-orang-lain");
  });

  it("gagal database → pesan generik TANPA detail internal", async () => {
    holder.client = makeMockSupabase([businessOk, { data: null, error: leakyDbError() }]);
    const res = await createProductAction(null, productForm());
    expect(res.error).toBe("Gagal menyimpan produk. Silakan coba lagi.");
    expect(res.error).not.toContain("42501");
    expect(res.error).not.toContain("permission denied");
    expect(res.error).not.toContain("RAHASIA-DB-DETAIL");
  });
});

describe("updateProductAction", () => {
  it("pengguna tidak login → ditolak", async () => {
    const client = makeMockSupabase([]);
    client.auth.getUser = async () => ({ data: { user: null } });
    holder.client = client;

    const res = await updateProductAction(null, productForm({ product_id: "prod-1" }));
    expect(res.error).toBe("Sesi berakhir. Silakan login ulang.");
    expect(client.updates).toHaveLength(0);
  });

  it("validasi gagal → pesan validasi", async () => {
    holder.client = makeMockSupabase([businessOk, updateOk]);
    const res = await updateProductAction(
      null,
      productForm({ product_id: "prod-1", selling_price: "abc" })
    );
    expect(res.error).toContain("Harga jual wajib angka yang valid.");
  });

  it("product_id kosong → 'Produk tidak ditemukan.'", async () => {
    holder.client = makeMockSupabase([businessOk, updateOk]);
    const res = await updateProductAction(null, productForm({ product_id: "  " }));
    expect(res.error).toBe("Produk tidak ditemukan.");
  });

  it("produk tidak ditemukan / bukan milik bisnis (0 baris) → pesan yang sama", async () => {
    holder.client = makeMockSupabase([businessOk, { data: null, error: null }]);
    const res = await updateProductAction(null, productForm({ product_id: "prod-1" }));
    expect(res.error).toBe("Produk tidak ditemukan.");
  });

  it("sukses → update 6 field TANPA menyentuh is_active", async () => {
    const client = makeMockSupabase([businessOk, updateOk]);
    holder.client = client;

    const res = await updateProductAction(null, productForm({ product_id: "prod-1" }));
    expect(res.success).toBe("Produk berhasil diperbarui.");
    expect(client.updates).toHaveLength(1);
    const payload = client.updates[0].payload ?? {};
    expect(client.updates[0].table).toBe("products");
    expect(payload).toHaveProperty("name");
    expect(payload).toHaveProperty("category");
    expect(payload).toHaveProperty("selling_price");
    expect(payload).toHaveProperty("unit_cost");
    expect(payload).toHaveProperty("stock");
    expect(payload).toHaveProperty("unit");
    expect(payload).not.toHaveProperty("is_active"); // khusus setProductActiveAction
    expect(revalidatePath).toHaveBeenCalledWith("/produk");
  });

  it("gagal database → pesan generik TANPA detail internal", async () => {
    holder.client = makeMockSupabase([businessOk, { data: null, error: leakyDbError() }]);
    const res = await updateProductAction(null, productForm({ product_id: "prod-1" }));
    expect(res.error).toBe("Gagal menyimpan perubahan produk. Silakan coba lagi.");
    expect(res.error).not.toContain("RAHASIA-DB-DETAIL");
    expect(res.error).not.toContain("42501");
  });
});

describe("setProductActiveAction", () => {
  it("pengguna tidak login → ditolak", async () => {
    const client = makeMockSupabase([]);
    client.auth.getUser = async () => ({ data: { user: null } });
    holder.client = client;

    const res = await setProductActiveAction("prod-1", false);
    expect(res.error).toBe("Sesi berakhir. Silakan login ulang.");
    expect(client.updates).toHaveLength(0);
  });

  it("productId kosong / status bukan boolean → ditolak", async () => {
    holder.client = makeMockSupabase([businessOk, updateOk]);
    expect((await setProductActiveAction("", false)).error).toBe("Produk tidak ditemukan.");
    const res = await setProductActiveAction(
      "prod-1",
      "bukan-boolean" as unknown as boolean
    );
    expect(res.error).toBe("Status produk tidak valid.");
  });

  it("produk tidak ditemukan / bukan milik bisnis (0 baris) → ditolak", async () => {
    holder.client = makeMockSupabase([businessOk, { data: null, error: null }]);
    const res = await setProductActiveAction("prod-1", false);
    expect(res.error).toBe("Produk tidak ditemukan.");
  });

  it("nonaktifkan → update HANYA { is_active: false } (tanpa DELETE, tanpa field lain)", async () => {
    const client = makeMockSupabase([businessOk, updateOk]);
    holder.client = client;

    const res = await setProductActiveAction("prod-1", false);
    expect(res.success).toBe("Produk dinonaktifkan.");
    expect(client.updates).toHaveLength(1);
    expect(client.updates[0].table).toBe("products");
    expect(client.updates[0].payload).toEqual({ is_active: false });
    expect(client.inserts).toHaveLength(0);
  });

  it("aktifkan → success dengan pesan yang tepat", async () => {
    holder.client = makeMockSupabase([businessOk, updateOk]);
    const res = await setProductActiveAction("prod-1", true);
    expect(res.success).toBe("Produk diaktifkan.");
  });

  it("gagal database → pesan generik TANPA detail internal", async () => {
    holder.client = makeMockSupabase([businessOk, { data: null, error: leakyDbError() }]);
    const res = await setProductActiveAction("prod-1", false);
    expect(res.error).toBe("Gagal mengubah status produk. Silakan coba lagi.");
    expect(res.error).not.toContain("RAHASIA-DB-DETAIL");
    expect(res.error).not.toContain("42501");
  });
});

describe("lookup bisnis — tiga kondisi dibedakan (resolveBusinessId)", () => {
  it("lookup berhasil → business id dari server yang dipakai", async () => {
    const client = makeMockSupabase([businessOk, insertOk]);
    holder.client = client;

    const res = await createProductAction(
      null,
      productForm({ business_id: "hack-id-milik-orang-lain" })
    );
    expect(res.success).toBeDefined();
    expect(client.inserts[0].payload?.business_id).toBe("biz-1");
    expect(client.inserts[0].payload?.business_id).not.toBe("hack-id-milik-orang-lain");
  });

  it("bisnis belum tersedia → ketiga action menolak dengan 'Profil bisnis belum ada'", async () => {
    const noBusiness: QueryResult = { data: null, error: null };

    holder.client = makeMockSupabase([noBusiness, insertOk]);
    expect((await createProductAction(null, productForm())).error).toContain(
      "Profil bisnis belum ada"
    );

    holder.client = makeMockSupabase([noBusiness, updateOk]);
    expect(
      (await updateProductAction(null, productForm({ product_id: "prod-1" }))).error
    ).toContain("Profil bisnis belum ada");

    holder.client = makeMockSupabase([noBusiness, updateOk]);
    expect((await setProductActiveAction("prod-1", false)).error).toContain(
      "Profil bisnis belum ada"
    );
  });

  it("lookup bisnis gagal (DB error) → ketiga action memberi pesan kegagalan DB, BUKAN 'Profil bisnis belum ada'", async () => {
    const lookupError: QueryResult = { data: null, error: leakyDbError() };
    const expected = "Gagal memuat data bisnis. Silakan coba lagi.";

    holder.client = makeMockSupabase([lookupError, insertOk]);
    const created = await createProductAction(null, productForm());
    expect(created.error).toBe(expected);
    expect(created.error).not.toContain("Profil bisnis belum ada");

    holder.client = makeMockSupabase([lookupError, updateOk]);
    const updated = await updateProductAction(null, productForm({ product_id: "prod-1" }));
    expect(updated.error).toBe(expected);
    expect(updated.error).not.toContain("Profil bisnis belum ada");

    holder.client = makeMockSupabase([lookupError, updateOk]);
    const toggled = await setProductActiveAction("prod-1", false);
    expect(toggled.error).toBe(expected);
    expect(toggled.error).not.toContain("Profil bisnis belum ada");
  });

  it("lookup gagal → fail-fast: tidak ada insert/update yang terjadi", async () => {
    const lookupError: QueryResult = { data: null, error: leakyDbError() };

    const c1 = makeMockSupabase([lookupError, insertOk]);
    holder.client = c1;
    await createProductAction(null, productForm());
    expect(c1.inserts).toHaveLength(0);

    const c2 = makeMockSupabase([lookupError, updateOk]);
    holder.client = c2;
    await updateProductAction(null, productForm({ product_id: "prod-1" }));
    expect(c2.updates).toHaveLength(0);

    const c3 = makeMockSupabase([lookupError, updateOk]);
    holder.client = c3;
    await setProductActiveAction("prod-1", false);
    expect(c3.updates).toHaveLength(0);
  });

  it("lookup gagal → detail DB dicatat via logDbError, tidak bocor ke pesan pengguna", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      holder.client = makeMockSupabase([{ data: null, error: leakyDbError() }, insertOk]);
      const res = await createProductAction(null, productForm());

      const log = errorSpy.mock.calls
        .map((call: unknown[]) => call.map((part: unknown) => String(part)).join(" "))
        .join("\n");
      // Tercatat: konteks route + tabel + kode error
      expect(log).toContain("db_error");
      expect(log).toContain("produk/actions");
      expect(log).toContain("businesses");
      expect(log).toContain("42501");
      // TIDAK bocor: detail sensitif & pesan ke user
      expect(log).not.toContain("RAHASIA-DB-DETAIL");
      expect(res.error).not.toContain("RAHASIA-DB-DETAIL");
      expect(res.error).not.toContain("42501");
    } finally {
      errorSpy.mockRestore();
    }
  });
});

describe("lintasan keamanan server actions", () => {
  it("tidak ada operasi DELETE, service_role, truncate, atau getSession di actions.ts", () => {
    const source = readFileSync(fileURLToPath(new URL("./actions.ts", import.meta.url)), "utf8");
    expect(source).not.toMatch(/\.delete\(/);
    expect(source).not.toMatch(/\.truncate\(/);
    expect(source).not.toMatch(/service_role/i);
    expect(source).not.toMatch(/getSession\(/); // wajib auth.getUser()
    expect(source).toContain("auth.getUser()");
    // business_id tidak pernah dibaca dari formData
    expect(source).not.toMatch(/formData\.get\("business_id"\)/);
  });
});
