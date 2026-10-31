/**
 * Konfigurasi OCR dari environment variables (server-side).
 *
 * Pola mengikuti src/lib/ai/config.ts:
 * - OCR_PROVIDER default "mock" → MODE SIMULASI (mock berlabel), bukan klaim AI.
 * - Key/kredensial hanya dipakai di server — tidak pernah dikirim ke browser,
 *   tidak pernah dicatat ke log (lihat src/lib/server-log.ts).
 *
 * Variabel yang didukung:
 * - OCR_PROVIDER                        "mock" (default) | "google-vision"
 * - OCR_API_KEY                         kunci API provider generik (opsional)
 * - OCR_API_BASE_URL                    endpoint provider (opsional)
 * - GOOGLE_APPLICATION_CREDENTIALS_JSON isi JSON service account (server-only)
 * - GOOGLE_APPLICATION_CREDENTIALS      path ke file key JSON (alternatif)
 * - GOOGLE_CLOUD_PROJECT                ID project Google Cloud (opsional)
 * - GOOGLE_VISION_LOCATION              lokasi/region (opsional)
 *
 * ATURAN KEAMANAN:
 * - Semua variabel Google TANPA prefix NEXT_PUBLIC_ (server-only) —
 *   secara struktural mustahil masuk bundle browser.
 * - Kredensial JSON TIDAK pernah di-parse diam-diam: harus valid sebagai
 *   service account key, atau eksplisit gagal dengan pesan yang tidak
 *   memuat isi kredensial.
 */

import { readFileSync } from "node:fs";

export interface OcrConfig {
  apiKey: string;
  /** nama provider yang diminta, mis. "mock" atau "google-vision" */
  provider: string;
  baseUrl: string;
}

/**
 * Kredensial service account Google yang SUDAH tervalidasi.
 * Bentuknya sudah dinormalisasi — siap dipakai google-auth-library.
 */
export interface GoogleServiceAccountCredentials {
  clientEmail: string;
  /** kunci privat PEM — normalisasi \n sudah diterapkan */
  privateKey: string;
  projectId: string;
  /** path file key bila memakai GOOGLE_APPLICATION_CREDENTIALS (opsional) */
  keyFile: string | null;
}

/** Kesalahan konfigurasi kredensial — pesan TIDAK PERNAH memuat isi kredensial */
export class OcrConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OcrConfigError";
  }
}

/** Cek apakah layanan OCR SUDAH punya kredensial (apa pun providernya) */
export function isOcrConfigured(): boolean {
  return Boolean(
    process.env.OCR_API_KEY ||
      process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON ||
      process.env.GOOGLE_APPLICATION_CREDENTIALS
  );
}

export function getOcrConfig(): OcrConfig {
  return {
    apiKey: process.env.OCR_API_KEY ?? "",
    provider: process.env.OCR_PROVIDER || "mock",
    baseUrl: (process.env.OCR_API_BASE_URL || "").replace(/\/$/, ""),
  };
}

export function getGoogleProjectConfig(): { projectId: string; location: string } {
  return {
    projectId: process.env.GOOGLE_CLOUD_PROJECT || "",
    location: process.env.GOOGLE_VISION_LOCATION || "",
  };
}

/**
 * Ambil & VALIDASI kredensial service account Google.
 *
 * Membaca (prioritas):
 * 1. GOOGLE_APPLICATION_CREDENTIALS_JSON — isi JSON service account
 * 2. GOOGLE_APPLICATION_CREDENTIALS      — path file key JSON
 *
 * Mengembalikan null bila keduanya kosong (belum dikonfigurasi).
 * Melempar OcrConfigError bila ada nilai tetapi TIDAK VALID — sengaja
 * tidak fallback diam-diam agar kesalahan konfigurasi ketahuan sejak dini.
 *
 * Validasi yang dilakukan (jangan menganggap JSON otomatis bekerja):
 * - JSON harus bisa di-parse & berupa objek
 * - type harus "service_account"
 * - client_email harus ada & berformat email
 * - private_key harus ada & berformat PEM ("BEGIN ... PRIVATE KEY")
 * - normalisasi literal "\n" pada private_key (sering rusak saat disalin
 *   ke environment variable)
 */
export function getGoogleCredentials(): GoogleServiceAccountCredentials | null {
  const rawJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON?.trim() ?? "";
  const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim() ?? "";
  const projectId = process.env.GOOGLE_CLOUD_PROJECT?.trim() ?? "";

  if (!rawJson && !keyFile) return null;

  // Mode file path: file harus ada & berisi JSON service account yang valid
  if (!rawJson) {
    const fromFile = readServiceAccountFile(keyFile);
    return { ...fromFile, keyFile };
  }

  return {
    ...parseServiceAccountJson(rawJson),
    keyFile: keyFile || null,
  };
}

/** Baca & validasi file key JSON (untuk GOOGLE_APPLICATION_CREDENTIALS) */
function readServiceAccountFile(filePath: string): Omit<GoogleServiceAccountCredentials, "keyFile"> {
  let raw: string;
  try {
    raw = readFileSync(filePath, "utf8");
  } catch {
    // Pesan hanya memuat path, BUKAN isi file
    throw new OcrConfigError(
      `File kredensial Google "${filePath}" tidak bisa dibaca. Periksa path GOOGLE_APPLICATION_CREDENTIALS.`
    );
  }
  return parseServiceAccountJson(raw);
}

/** Parse & validasi isi JSON service account */
function parseServiceAccountJson(raw: string): Omit<GoogleServiceAccountCredentials, "keyFile"> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new OcrConfigError(
      "Kredensial Google (GOOGLE_APPLICATION_CREDENTIALS_JSON) bukan JSON yang valid."
    );
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new OcrConfigError(
      "Kredensial Google harus berupa objek JSON service account."
    );
  }

  const obj = parsed as Record<string, unknown>;

  if (obj.type !== "service_account") {
    throw new OcrConfigError(
      'Kredensial Google harus berupa service account key (type = "service_account").'
    );
  }

  const clientEmail = typeof obj.client_email === "string" ? obj.client_email.trim() : "";
  if (!clientEmail || !clientEmail.includes("@")) {
    throw new OcrConfigError(
      "Kredensial Google tidak valid: client_email hilang atau tidak berformat email."
    );
  }

  const rawKey = typeof obj.private_key === "string" ? obj.private_key : "";
  if (!rawKey.includes("BEGIN") || !rawKey.includes("PRIVATE KEY")) {
    throw new OcrConfigError(
      "Kredensial Google tidak valid: private_key hilang atau tidak berformat PEM."
    );
  }

  // Normalisasi: literal "\n" (backslash-n) yang tersimpan di env → newline asli
  const privateKey = rawKey.replace(/\\n/g, "\n");

  const fileProjectId = typeof obj.project_id === "string" ? obj.project_id.trim() : "";
  return {
    clientEmail,
    privateKey,
    projectId: fileProjectId || process.env.GOOGLE_CLOUD_PROJECT?.trim() || "",
  };
}
