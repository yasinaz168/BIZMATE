import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getGoogleCredentials,
  getOcrConfig,
  isOcrConfigured,
  OcrConfigError,
  type GoogleServiceAccountCredentials,
} from "./config";
import { registerServerOcrProviders } from "./register";
import { getOcrProvider } from "./provider";
import { mockOcrProvider } from "./mock";

/**
 * Pengujian seleksi provider + parsing/validasi kredensial Google (Stage B).
 *
 * Dijaga:
 * - Mock SELALU default (#9).
 * - Google Vision aktif HANYA bila OCR_PROVIDER=google-vision DAN
 *   kredensial tersedia (#10).
 * - Tanpa kredensial → aplikasi tetap berjalan dengan Mock (#11).
 * - Kredensial ada tetapi tidak valid → error eksplisit, bukan diam-diam (#6).
 * - Kredensial tidak bocor ke pesan error.
 */

const ENV_KEYS = [
  "OCR_API_KEY",
  "OCR_PROVIDER",
  "OCR_API_BASE_URL",
  "GOOGLE_APPLICATION_CREDENTIALS_JSON",
  "GOOGLE_APPLICATION_CREDENTIALS",
  "GOOGLE_CLOUD_PROJECT",
] as const;

const originalEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

beforeEach(() => {
  registerServerOcrProviders();
  for (const k of ENV_KEYS) originalEnv[k] = process.env[k];
  for (const k of ENV_KEYS) delete process.env[k];
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (originalEnv[k] === undefined) delete process.env[k];
    else process.env[k] = originalEnv[k];
  }
});

const VALID_SA = {
  type: "service_account",
  project_id: "bizmate-ocr",
  client_email: "bizmate-ocr-service@bizmate-ocr.iam.gserviceaccount.com",
  private_key: "-----BEGIN PRIVATE KEY-----\nRAHASIA-PRIBADI-XYZ-123\n-----END PRIVATE KEY-----\n",
};

describe("seleksi provider — Mock tetap default", () => {
  it("tanpa konfigurasi apa pun → Mock OCR", () => {
    expect(getOcrConfig().provider).toBe("mock");
    expect(isOcrConfigured()).toBe(false);
    expect(getOcrProvider()).toBe(mockOcrProvider);
    expect(getOcrProvider().simulation).toBe(true);
  });

  it("OCR_PROVIDER default 'mock' walau kredensial Google ada", () => {
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON = JSON.stringify(VALID_SA);
    expect(getOcrConfig().provider).toBe("mock");
    expect(getOcrProvider()).toBe(mockOcrProvider);
  });
});

describe("seleksi provider — Google Vision hanya aktif bila terkonfigurasi", () => {
  it("OCR_PROVIDER=google-vision + kredensial valid → provider google-vision", () => {
    process.env.OCR_PROVIDER = "google-vision";
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON = JSON.stringify(VALID_SA);
    const provider = getOcrProvider();
    expect(provider.name).toBe("google-vision");
    expect(provider.simulation).toBe(false);
  });

  it("OCR_PROVIDER=google-vision TANPA kredensial → tetap Mock (aplikasi tetap jalan)", () => {
    process.env.OCR_PROVIDER = "google-vision";
    // tidak ada GOOGLE_APPLICATION_CREDENTIALS_JSON / GOOGLE_APPLICATION_CREDENTIALS
    const provider = getOcrProvider();
    expect(provider.simulation).toBe(true); // mock berlabel simulasi
    expect(provider.name).toBe("mock");
  });

  it("OCR_PROVIDER=google-vision + kredensial TIDAK VALID → error eksplisit, bukan fallback diam-diam", () => {
    process.env.OCR_PROVIDER = "google-vision";
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON = "{ rusak-tidak-valid";
    let thrown: unknown;
    try {
      getOcrProvider();
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(OcrConfigError);
  });
});

describe("getGoogleCredentials — parsing & validasi (jangan asumsikan otomatis bekerja)", () => {
  it("mengembalikan null bila tidak dikonfigurasi", () => {
    expect(getGoogleCredentials()).toBeNull();
  });

  it("mem-parse JSON service account yang valid + normalisasi \\n private_key", () => {
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON = JSON.stringify(VALID_SA);
    const creds = getGoogleCredentials() as GoogleServiceAccountCredentials;
    expect(creds.clientEmail).toBe(VALID_SA.client_email);
    expect(creds.projectId).toBe("bizmate-ocr");
    // Literal "\n" (hasil JSON) sudah dinormalisasi menjadi newline asli
    expect(creds.privateKey).toContain("\n");
    expect(creds.privateKey).toContain("BEGIN PRIVATE KEY");
  });

  it("JSON tidak valid → OcrConfigError", () => {
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON = "{ ini bukan json";
    expect(() => getGoogleCredentials()).toThrow(OcrConfigError);
  });

  it("JSON valid tetapi bukan objek (array/string) → OcrConfigError", () => {
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON = "[1,2,3]";
    expect(() => getGoogleCredentials()).toThrow(OcrConfigError);
  });

  it("type bukan service_account → OcrConfigError", () => {
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON = JSON.stringify({
      ...VALID_SA,
      type: "authorized_user",
    });
    expect(() => getGoogleCredentials()).toThrow(OcrConfigError);
  });

  it("client_email hilang → OcrConfigError", () => {
    const { client_email: _omit, ...tanpaEmail } = VALID_SA;
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON = JSON.stringify(tanpaEmail);
    expect(() => getGoogleCredentials()).toThrow(OcrConfigError);
  });

  it("private_key bukan PEM → OcrConfigError", () => {
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON = JSON.stringify({
      ...VALID_SA,
      private_key: "bukan-kunci-pem",
    });
    expect(() => getGoogleCredentials()).toThrow(OcrConfigError);
  });

  it("GOOGLE_APPLICATION_CREDENTIALS (file tidak ada) → OcrConfigError, pesan hanya memuat path", () => {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = "/path/tidak/ada/key.json";
    let thrown: unknown;
    try {
      getGoogleCredentials();
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(OcrConfigError);
    const err = thrown as OcrConfigError;
    expect(err.message).toContain("key.json");
    expect(err.message).not.toContain("RAHASIA");
  });
});

describe("kredensial tidak bocor", () => {
  it("pesan error validasi tidak memuat isi kredensial", () => {
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON = JSON.stringify({
      ...VALID_SA,
      type: "authorized_user",
    });
    let thrown: unknown;
    try {
      getGoogleCredentials();
    } catch (e) {
      thrown = e;
    }
    const err = thrown as OcrConfigError;
    expect(err.message).not.toContain("RAHASIA-PRIBADI-XYZ-123");
    expect(err.message).not.toContain("bizmate-ocr-service@");
  });

  it("getOcrConfig tidak memuat private_key", () => {
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON = JSON.stringify(VALID_SA);
    const flat = JSON.stringify(getOcrConfig());
    expect(flat).not.toContain("RAHASIA-PRIBADI-XYZ-123");
    expect(flat).not.toContain("BEGIN PRIVATE KEY");
  });
});
