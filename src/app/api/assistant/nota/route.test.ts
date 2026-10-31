import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeMockSupabase, type QueryResult } from "@/test/mock-supabase";
import { registerOcrProvider } from "@/lib/ocr/provider";
import { MAX_OCR_IMAGE_BYTES } from "@/lib/ocr/provider";
import type { OcrProvider } from "@/lib/ocr/types";

/**
 * Pengujian POST /api/assistant/nota (Stage C).
 *
 * Dijaga (tugas #15):
 * - Upload gambar valid · file terlalu besar · MIME tidak didukung ·
 *   magic bytes tidak cocok · file kosong/rusak · Mock OCR berhasil ·
 *   OCR gagal · TIDAK ada transaksi yang otomatis disimpan.
 *
 * Memakai Mock OCR asli (tanpa Google/billing). Tidak ada panggilan jaringan.
 */

const holder = vi.hoisted(() => ({ client: null as unknown }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => holder.client,
}));
vi.mock("@/lib/supabase/config", () => ({
  isSupabaseConfigured: () => true,
}));

import { POST } from "./route";

// Magic byte header
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const GARBAGE = new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]);

const emptyResults: QueryResult[] = [];

function uploadRequest(
  bytes: Uint8Array<ArrayBuffer>,
  opts: { type?: string; name?: string; field?: string } = {}
): Request {
  const { type = "image/png", name = "nota.png", field = "image" } = opts;
  const fd = new FormData();
  fd.append(field, new File([bytes], name, { type }));
  return new Request("http://localhost/api/assistant/nota", {
    method: "POST",
    body: fd,
  });
}

const ENV_KEYS = ["OCR_API_KEY", "OCR_PROVIDER"] as const;
const originalEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

beforeEach(() => {
  holder.client = makeMockSupabase(emptyResults);
  for (const k of ENV_KEYS) originalEnv[k] = process.env[k];
  for (const k of ENV_KEYS) delete process.env[k];
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (originalEnv[k] === undefined) delete process.env[k];
    else process.env[k] = originalEnv[k];
  }
});

describe("POST /api/assistant/nota — upload valid & Mock OCR", () => {
  it("upload gambar PNG valid → 200 + draft (belum disimpan)", async () => {
    const res = await POST(uploadRequest(PNG));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.saved).toBe(false); // belum menyimpan transaksi
    expect(body.draft).toBeDefined();
    expect(Array.isArray(body.warnings)).toBe(true);
  });

  it("Mock OCR berhasil → simulation true + label SIMULASI + draft terisi", async () => {
    const res = await POST(uploadRequest(JPEG, { type: "image/jpeg", name: "nota.jpg" }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.provider).toBe("mock");
    expect(body.simulation).toBe(true);
    expect(body.warnings.join(" ")).toContain("SIMULASI");
    expect(body.rawText).toContain("SIMULASI");
    // Draft mock terisi (bukan semua unread)
    expect(body.draft.shop_name.value).toBe("Toko Berkah Jaya");
    expect(body.draft.shop_name.status).toBe("read");
  });

  it("respons tidak mengandung kredensial / data internal", async () => {
    const res = await POST(uploadRequest(PNG));
    const flat = JSON.stringify(await res.json());
    expect(flat).not.toContain("PRIVATE KEY");
    expect(flat).not.toContain("client_email");
    expect(flat).not.toMatch(/NEXT_PUBLIC|GOOGLE_APPLICATION_CREDENTIALS/);
  });

  it("field 'file' juga diterima (alternatif nama field)", async () => {
    const res = await POST(uploadRequest(PNG, { field: "file" }));
    expect(res.status).toBe(200);
  });
});

describe("POST /api/assistant/nota — validasi file", () => {
  it("file terlalu besar (> 10 MB) → 413", async () => {
    const big = new Uint8Array(MAX_OCR_IMAGE_BYTES + 1);
    big.set(PNG, 0);
    const res = await POST(uploadRequest(big));
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.error).toContain("10 MB");
  });

  it("MIME type tidak didukung (HEIC) → 400", async () => {
    const res = await POST(uploadRequest(PNG, { type: "image/heic", name: "nota.heic" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("tidak didukung");
  });

  it("magic bytes tidak cocok dengan MIME klaim → 400", async () => {
    // Isi PNG tapi mengklaim JPEG
    const res = await POST(uploadRequest(PNG, { type: "image/jpeg", name: "nota.jpg" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("tidak sesuai");
  });

  it("file kosong (0 byte) → 400", async () => {
    const res = await POST(uploadRequest(new Uint8Array([])));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("kosong");
  });

  it("file rusak / bukan gambar → 400", async () => {
    const res = await POST(uploadRequest(GARBAGE, { type: "image/png" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("tidak dikenali");
  });

  it("tanpa file sama sekali → 400", async () => {
    const fd = new FormData();
    fd.append("catatan", "hanya teks");
    const res = await POST(
      new Request("http://localhost/api/assistant/nota", { method: "POST", body: fd })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("wajib");
  });
});

describe("POST /api/assistant/nota — OCR gagal & penyimpanan", () => {
  it("OCR gagal (provider error) → 502 dengan pesan aman, tanpa bocor detail", async () => {
    const failing: OcrProvider = {
      name: "gagal",
      simulation: false,
      recognize: async () => {
        throw new Error("jaringan putus RAHASIA-INTERNAL-XYZ");
      },
    };
    registerOcrProvider("gagal", () => failing);
    process.env.OCR_API_KEY = "test-key-bukan-rahasia";
    process.env.OCR_PROVIDER = "gagal";

    const res = await POST(uploadRequest(PNG));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toContain("Gagal memproses");
    // Detail internal tidak bocor ke respons
    expect(body.error).not.toContain("RAHASIA-INTERNAL-XYZ");
    expect(JSON.stringify(body)).not.toContain("test-key-bukan-rahasia");
  });

  it("TIDAK ada transaksi yang otomatis disimpan (tidak ada insert ke DB)", async () => {
    const client = makeMockSupabase(emptyResults);
    holder.client = client;

    const res = await POST(uploadRequest(PNG));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.saved).toBe(false);
    // Endpoint ini murni OCR: tidak pernah menyentuh tabel transaksi
    expect(client.inserts).toHaveLength(0);
  });
});

describe("POST /api/assistant/nota — autentikasi", () => {
  it("tanpa sesi login → 401", async () => {
    const client = makeMockSupabase(emptyResults);
    client.auth.getUser = async () => ({ data: { user: null } });
    holder.client = client;

    const res = await POST(uploadRequest(PNG));
    expect(res.status).toBe(401);
  });
});
