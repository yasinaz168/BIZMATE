import { getGoogleCredentials, type OcrConfig } from "./config";
import { createGoogleVisionProvider } from "./google-vision";
import { mockOcrProvider } from "./mock";
import { registerOcrProvider } from "./provider";
import type { OcrProvider } from "./types";

/**
 * REGISTRASI PROVIDER OCR DI SERVER (Stage B).
 *
 * Dipanggil EKSPLISIT di sisi server (route handler / startup) SEBELUM
 * memakai recognizeReceiptImage(). Modul ini tidak menyentuh database,
 * UI, atau API route — murni mendaftarkan provider ke registry.
 *
 * Aturan seleksi (jujur & tanpa kejutan):
 * - Default                     → Mock OCR (berlabel SIMULASI) — #9.
 * - OCR_PROVIDER=google-vision  → Google Vision AKTIF hanya bila kredensial
 *                                 service account tersedia & valid — #10.
 * - OCR_PROVIDER=google-vision tanpa kredensial
 *                               → tetap Mock OCR (berlabel SIMULASI) agar
 *                                 aplikasi terus berjalan — #11.
 * - Kredensial ADA tetapi TIDAK VALID (JSON rusak, dsb.)
 *                               → error eksplisit OcrConfigError, BUKAN
 *                                 fallback diam-diam — jangan menganggap
 *                                 kredensial otomatis bekerja (#6).
 *
 * Kredensial tidak pernah dicatat/dikirim ke mana pun — hanya diteruskan
 * ke google-auth-library di server untuk mendapatkan access token.
 */

/**
 * Daftarkan provider Google Vision ke registry.
 * Idempotent — aman dipanggil berulang.
 */
export function registerServerOcrProviders(): void {
  registerOcrProvider("google-vision", (_config: OcrConfig): OcrProvider => {
    // getGoogleCredentials():
    //  - null              → belum dikonfigurasi (tidak ada env-nya sama sekali)
    //  - OcrConfigError    → ada nilainya tetapi tidak valid → DILEMPARKAN
    //  - objek kredensial  → valid & siap dipakai
    const credentials = getGoogleCredentials();

    if (!credentials) {
      // #11 — tanpa kredensial, aplikasi tetap berjalan dengan Mock OCR.
      // Mock JUJUR berlabel SIMULASI (simulation: true + teks "[SIMULASI]"),
      // sehingga tidak pernah mengaku sebagai hasil pembacaan foto sungguhan.
      return mockOcrProvider;
    }

    // Kredensial tervalidasi → provider Google Vision sungguhan.
    // Auth/fetch dapat disuntikkan untuk pengujian; default memakai
    // google-auth-library + global fetch di server.
    return createGoogleVisionProvider(credentials);
  });
}
