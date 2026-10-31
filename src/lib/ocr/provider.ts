import { getOcrConfig, isOcrConfigured, type OcrConfig } from "./config";
import { mockOcrProvider } from "./mock";
import type { OcrImageInput, OcrProvider, OcrProviderResult } from "./types";

/**
 * ABSTRAKSI PROVIDER OCR — Tahap 1 (OCR Foundation).
 *
 * Tujuan: menambah provider nyata (Google Cloud Vision, Azure Read, dll.)
 * cukup dengan membuat implementasi OcrProvider + mendaftarkannya lewat
 * registerOcrProvider() — tanpa menyentuh pemanggil.
 *
 * Aturan kejujuran (jangan pernah dilanggar):
 * - Tanpa OCR_API_KEY → provider mock (simulasi BERLABEL) yang jujur
 *   menyatakan dirinya simulasi.
 * - OCR_API_KEY ada tetapi provider belum terdaftar → error eksplisit
 *   "belum diimplementasikan", BUKAN fallback diam-diam ke mock.
 * - Kegagalan provider dibungkus OcrProviderError tanpa membocorkan
 *   key/API key maupun isi gambar.
 */

/** Batas ukuran gambar nota yang diterima */
export const MAX_OCR_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB

/** Tipe gambar yang diterima */
export const ALLOWED_OCR_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

/** Input gambar tidak valid (bukan gambar, kosong, atau terlalu besar) */
export class OcrInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OcrInputError";
  }
}

/**
 * Kegagalan provider OCR — termasuk "provider belum diimplementasikan".
 * Pesan sengaja TIDAK memuat API key/secret apa pun.
 */
export class OcrProviderError extends Error {
  readonly providerName: string;
  readonly code: "not_implemented" | "failed";

  constructor(
    message: string,
    providerName: string,
    code: "not_implemented" | "failed"
  ) {
    super(message);
    this.name = "OcrProviderError";
    this.providerName = providerName;
    this.code = code;
  }
}

/** Factory pembuat provider — menerima konfigurasi OCR server */
export type OcrProviderFactory = (config: OcrConfig) => OcrProvider;

const registry = new Map<string, OcrProviderFactory>();

// Mock SELALU terdaftar — Mode Simulasi bisa dipilih eksplisit kapan pun
// (hasilnya tetap berlabel SIMULASI, jadi tidak menyesatkan).
registry.set("mock", () => mockOcrProvider);

/** Daftarkan provider OCR nyata (dipanggil sekali saat startup/tahap integrasi) */
export function registerOcrProvider(name: string, factory: OcrProviderFactory): void {
  registry.set(name, factory);
}

/**
 * Pilih provider sesuai konfigurasi.
 * - OCR_API_KEY kosong → mock (Mode Simulasi berlabel).
 * - OCR_API_KEY ada → provider terdaftar sesuai OCR_PROVIDER, atau error
 *   eksplisit bila belum diimplementasikan (tidak ada fallback diam-diam).
 */
export function getOcrProvider(): OcrProvider {
  const config = getOcrConfig();

  if (!isOcrConfigured()) {
    // Mode Simulasi — provider mock jujur menyatakan dirinya simulasi
    return mockOcrProvider;
  }

  const factory = registry.get(config.provider);
  if (!factory) {
    throw new OcrProviderError(
      `Provider OCR "${config.provider}" belum diimplementasikan. ` +
        `Isi OCR_PROVIDER dengan nama provider yang sudah didaftarkan, ` +
        `atau kosongkan OCR_API_KEY untuk berjalan dalam Mode Simulasi.`,
      config.provider,
      "not_implemented"
    );
  }
  return factory(config);
}

/** Validasi input gambar sebelum diproses provider */
export function validateOcrImage(image: OcrImageInput): void {
  if (!image || !(image.bytes instanceof Uint8Array) || image.bytes.length === 0) {
    throw new OcrInputError("Gambar nota kosong atau tidak valid.");
  }
  if (image.bytes.length > MAX_OCR_IMAGE_BYTES) {
    throw new OcrInputError(
      `Ukuran gambar melebihi batas maksimum ${Math.round(
        MAX_OCR_IMAGE_BYTES / (1024 * 1024)
      )} MB.`
    );
  }
  if (!ALLOWED_OCR_MIME_TYPES.includes(image.mimeType as (typeof ALLOWED_OCR_MIME_TYPES)[number])) {
    throw new OcrInputError(
      `Format gambar "${image.mimeType}" tidak didukung. Gunakan JPG, PNG, atau WebP.`
    );
  }
}

/**
 * Kenali isi gambar nota → hasil mentah OCR (OcrProviderResult).
 * Menangani pemilihan provider, validasi input, dan pembungkusan error.
 * TIDAK menyimpan apa pun — murni fungsi pembacaan.
 */
export async function recognizeReceiptImage(
  image: OcrImageInput
): Promise<OcrProviderResult> {
  validateOcrImage(image);
  const provider = getOcrProvider();

  try {
    return await provider.recognize(image);
  } catch (error) {
    if (error instanceof OcrInputError || error instanceof OcrProviderError) {
      throw error;
    }
    // Bungkus tanpa membocorkan detail sensitif (key, isi gambar, dll.)
    throw new OcrProviderError(
      `Provider OCR "${provider.name}" gagal memproses gambar nota.`,
      provider.name,
      "failed"
    );
  }
}
