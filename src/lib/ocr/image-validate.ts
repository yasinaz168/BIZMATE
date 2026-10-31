import {
  ALLOWED_OCR_MIME_TYPES,
  MAX_OCR_IMAGE_BYTES,
  OcrInputError,
} from "./provider";
import type { OcrImageInput } from "./types";

/**
 * VALIDASI FILE GAMBAR UPLOAD — Stage C (Server API Foundation).
 *
 * Validasi dilakukan di SERVER berdasarkan:
 * 1. Ukuran (maksimal 10 MB)
 * 2. MIME type yang DIDUKUNG saja: JPG, PNG, WebP (HEIC BELUM diterima)
 * 3. MAGIC BYTES — isi file harus benar-benar gambar yang sesuai, BUKAN
 *    sekadar nama file / klaim Content-Type.
 *
 * Prinsip: jangan percaya nama file maupun Content-Type dari klien.
 * Tipe hasil yang dipakai adalah tipe TERDETEKSI dari magic bytes
 * (otoritatif), bukan yang diklaim.
 */

export type ImageMimeType = "image/jpeg" | "image/png" | "image/webp";

/**
 * Deteksi tipe gambar dari magic bytes (beberapa byte pertama).
 * Mengembalikan null bila bukan gambar yang dikenali.
 */
export function detectImageMimeType(bytes: Uint8Array): ImageMimeType | null {
  // JPEG: FF D8 FF
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  // WebP: "RIFF" .... "WEBP" (byte 0-3 = RIFF, byte 8-11 = WEBP)
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

export interface ImageUploadInput {
  bytes: Uint8Array;
  /** MIME type yang DIKLAIM klien (dari FormData) — boleh kosong */
  declaredMimeType: string;
  fileName?: string;
}

/**
 * Validasi penuh file upload → OcrImageInput yang aman diproses.
 *
 * Melempar OcrInputError untuk kasus:
 * - file kosong
 * - ukuran > 10 MB
 * - tipe tidak didukung (mis. HEIC, GIF, PDF)
 * - magic bytes tidak dikenali (file rusak / bukan gambar)
 * - magic bytes tidak cocok dengan tipe yang diklaim
 *
 * Tipe yang dikembalikan adalah hasil DETEKSI magic bytes (otoritatif).
 */
export function validateImageUpload(input: ImageUploadInput): OcrImageInput {
  const { bytes, declaredMimeType, fileName } = input;

  if (!bytes || bytes.length === 0) {
    throw new OcrInputError("File gambar kosong.");
  }

  if (bytes.length > MAX_OCR_IMAGE_BYTES) {
    throw new OcrInputError(
      `Ukuran gambar melebihi batas maksimum ${Math.round(
        MAX_OCR_IMAGE_BYTES / (1024 * 1024)
      )} MB.`
    );
  }

  const detected = detectImageMimeType(bytes);
  if (!detected) {
    throw new OcrInputError(
      "File bukan gambar yang didukung atau rusak (format tidak dikenali)."
    );
  }

  const declared = (declaredMimeType || "").trim().toLowerCase();
  if (declared) {
    if (!(ALLOWED_OCR_MIME_TYPES as readonly string[]).includes(declared)) {
      throw new OcrInputError(
        `Format "${declared}" tidak didukung. Gunakan JPG, PNG, atau WebP.`
      );
    }
    if (declared !== detected) {
      throw new OcrInputError(
        "Isi file tidak sesuai dengan tipe gambar yang diklaim."
      );
    }
  }

  return { bytes, mimeType: detected, fileName };
}
