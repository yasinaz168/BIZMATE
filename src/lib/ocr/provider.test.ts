import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getOcrProvider,
  recognizeReceiptImage,
  registerOcrProvider,
  validateOcrImage,
  OcrInputError,
  OcrProviderError,
  MAX_OCR_IMAGE_BYTES,
} from "./provider";
import { isOcrConfigured } from "./config";
import { mockOcrProvider } from "./mock";
import type { OcrImageInput, OcrProvider } from "./types";

/**
 * Pengujian abstraksi provider OCR (Tahap 1).
 *
 * Dijaga:
 * - Pemilihan provider: tanpa key → mock (simulasi berlabel); dengan key
 *   tapi provider belum terdaftar → error EKSPLISIT, bukan fallback diam-diam.
 * - Penanganan kegagalan provider: dibungkus OcrProviderError tanpa
 *   membocorkan data sensitif (key, isi gambar, pesan error mentah).
 * - Validasi input gambar sebelum diproses.
 */

const PNG: OcrImageInput = {
  bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
  mimeType: "image/png",
};

/** Simpan & pulihkan env di sekitar setiap test (jangan bocorkan nilai) */
const ENV_KEYS = ["OCR_API_KEY", "OCR_PROVIDER", "OCR_API_BASE_URL"] as const;
const originalEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) originalEnv[k] = process.env[k];
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (originalEnv[k] === undefined) delete process.env[k];
    else process.env[k] = originalEnv[k];
  }
});

describe("pemilihan provider OCR", () => {
  it("tanpa OCR_API_KEY → mock (Mode Simulasi berlabel)", () => {
    delete process.env.OCR_API_KEY;
    expect(isOcrConfigured()).toBe(false);
    const provider = getOcrProvider();
    expect(provider.name).toBe("mock");
    expect(provider.simulation).toBe(true);
    expect(provider).toBe(mockOcrProvider);
  });

  it("OCR_PROVIDER=mock dengan key terisi tetap memilih mock yang jujur berlabel", () => {
    process.env.OCR_API_KEY = "test-key-bukan-rahasia";
    process.env.OCR_PROVIDER = "mock";
    const provider = getOcrProvider();
    expect(provider.name).toBe("mock");
    expect(provider.simulation).toBe(true);
  });

  it("key ada + provider belum terdaftar → error EKSPLISIT 'not_implemented', bukan fallback diam-diam", () => {
    process.env.OCR_API_KEY = "test-key-bukan-rahasia";
    process.env.OCR_PROVIDER = "google-vision";
    let thrown: unknown;
    try {
      getOcrProvider();
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(OcrProviderError);
    const err = thrown as OcrProviderError;
    expect(err.code).toBe("not_implemented");
    expect(err.providerName).toBe("google-vision");
    expect(err.message).toContain("belum diimplementasikan");
  });

  it("provider terdaftar lewat registerOcrProvider dipakai sesuai nama", async () => {
    const custom: OcrProvider = {
      name: "vision-uji",
      simulation: false,
      async recognize() {
        return {
          provider: "vision-uji",
          simulation: false,
          rawText: "nota uji",
          confidence: 0.9,
        };
      },
    };
    registerOcrProvider("vision-uji", () => custom);
    process.env.OCR_API_KEY = "test-key-bukan-rahasia";
    process.env.OCR_PROVIDER = "vision-uji";

    const provider = getOcrProvider();
    expect(provider.name).toBe("vision-uji");
    expect(provider.simulation).toBe(false);

    const result = await recognizeReceiptImage(PNG);
    expect(result.provider).toBe("vision-uji");
    expect(result.confidence).toBe(0.9);
  });
});

describe("penanganan kegagalan provider", () => {
  it("error internal provider dibungkus OcrProviderError 'failed'", async () => {
    const failing: OcrProvider = {
      name: "rusak",
      simulation: false,
      async recognize() {
        throw new Error("ECONNREFUSED key=SECRET-INTERNAL-XYZ");
      },
    };
    registerOcrProvider("rusak", () => failing);
    process.env.OCR_API_KEY = "test-key-bukan-rahasia";
    process.env.OCR_PROVIDER = "rusak";

    let thrown: unknown;
    try {
      await recognizeReceiptImage(PNG);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(OcrProviderError);
    const err = thrown as OcrProviderError;
    expect(err.code).toBe("failed");
    expect(err.providerName).toBe("rusak");
    // Pesan error TIDAK membocorkan detail mentah (key/secret internal)
    expect(err.message).not.toContain("SECRET-INTERNAL-XYZ");
    expect(err.message).not.toContain("ECONNREFUSED");
  });

  it("OcrInputError dari validasi diteruskan apa adanya (tidak dikonversi)", async () => {
    delete process.env.OCR_API_KEY;
    await expect(
      recognizeReceiptImage({ bytes: new Uint8Array([]), mimeType: "image/png" })
    ).rejects.toBeInstanceOf(OcrInputError);
  });
});

describe("validasi input gambar", () => {
  it("menolak bytes kosong", () => {
    expect(() =>
      validateOcrImage({ bytes: new Uint8Array([]), mimeType: "image/png" })
    ).toThrow(OcrInputError);
  });

  it("menolak tipe file non-gambar", () => {
    expect(() =>
      validateOcrImage({ bytes: new Uint8Array([1]), mimeType: "application/pdf" })
    ).toThrow(OcrInputError);
    expect(() =>
      validateOcrImage({ bytes: new Uint8Array([1]), mimeType: "text/plain" })
    ).toThrow(OcrInputError);
  });

  it("menolak gambar melebihi batas ukuran", () => {
    const oversize = new Uint8Array(MAX_OCR_IMAGE_BYTES + 1);
    expect(() => validateOcrImage({ bytes: oversize, mimeType: "image/png" })).toThrow(
      OcrInputError
    );
  });

  it("menerima JPG/PNG/WebP yang valid", () => {
    for (const mimeType of ["image/jpeg", "image/png", "image/webp"]) {
      expect(() =>
        validateOcrImage({ bytes: new Uint8Array([1, 2, 3]), mimeType })
      ).not.toThrow();
    }
  });
});

describe("modul provider tidak menyimpan transaksi", () => {
  it("recognizeReceiptImage hanya mengembalikan hasil bacaan (tanpa penyimpanan)", async () => {
    delete process.env.OCR_API_KEY;
    const result = await recognizeReceiptImage(PNG);
    expect(result).toHaveProperty("rawText");
    expect(result).toHaveProperty("simulation");
    // Tidak ada id transaksi / penanda tersimpan pada hasil
    expect(result).not.toHaveProperty("id");
    expect(JSON.stringify(result)).not.toMatch(/transactionId|"saved"/);
  });
});
