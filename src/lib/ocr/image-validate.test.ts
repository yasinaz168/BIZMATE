import { describe, expect, it } from "vitest";
import {
  detectImageMimeType,
  validateImageUpload,
  type ImageUploadInput,
} from "./image-validate";
import { MAX_OCR_IMAGE_BYTES, OcrInputError } from "./provider";

/**
 * Pengujian validasi file gambar (Stage C).
 *
 * Dijaga:
 * - Deteksi MAGIC BYTES (bukan nama file/klaim Content-Type).
 * - Hanya JPG/PNG/WebP yang diterima (HEIC & lainnya ditolak).
 * - Batas ukuran 10 MB.
 * - Magic bytes yang tidak cocok dengan MIME klaim → ditolak.
 */

// Magic byte header untuk tiap format
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const WEBP = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 1, 2,
]);
const GARBAGE = new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]);

function upload(bytes: Uint8Array, declaredMimeType: string): ImageUploadInput {
  return { bytes, declaredMimeType, fileName: "nota" };
}

describe("detectImageMimeType — magic bytes", () => {
  it("mengenali PNG dari magic bytes", () => {
    expect(detectImageMimeType(PNG)).toBe("image/png");
  });
  it("mengenali JPEG dari magic bytes", () => {
    expect(detectImageMimeType(JPEG)).toBe("image/jpeg");
  });
  it("mengenali WebP dari magic bytes (RIFF....WEBP)", () => {
    expect(detectImageMimeType(WEBP)).toBe("image/webp");
  });
  it("mengembalikan null untuk data yang bukan gambar", () => {
    expect(detectImageMimeType(GARBAGE)).toBeNull();
    expect(detectImageMimeType(new Uint8Array([]))).toBeNull();
  });
});

describe("validateImageUpload — terima format yang didukung", () => {
  it("menerima PNG/JPEG/WebP dengan MIME klaim yang cocok", () => {
    expect(validateImageUpload(upload(PNG, "image/png")).mimeType).toBe("image/png");
    expect(validateImageUpload(upload(JPEG, "image/jpeg")).mimeType).toBe("image/jpeg");
    expect(validateImageUpload(upload(WEBP, "image/webp")).mimeType).toBe("image/webp");
  });

  it("menerima bila MIME klaim kosong — mengandalkan magic bytes", () => {
    expect(validateImageUpload(upload(PNG, "")).mimeType).toBe("image/png");
    expect(validateImageUpload(upload(JPEG, "  ")).mimeType).toBe("image/jpeg");
  });

  it("mempertahankan bytes & fileName apa adanya", () => {
    const out = validateImageUpload(upload(PNG, "image/png"));
    expect(out.bytes).toBe(PNG);
    expect(out.fileName).toBe("nota");
  });
});

describe("validateImageUpload — tolak yang tidak didukung", () => {
  it("menolak MIME type tidak didukung (HEIC, GIF, PDF)", () => {
    expect(() => validateImageUpload(upload(PNG, "image/heic"))).toThrow(OcrInputError);
    expect(() => validateImageUpload(upload(PNG, "image/gif"))).toThrow(OcrInputError);
    expect(() => validateImageUpload(upload(PNG, "application/pdf"))).toThrow(OcrInputError);
  });

  it("menolak magic bytes yang tidak cocok dengan MIME yang diklaim", () => {
    // Isi PNG tapi mengklaim JPEG
    expect(() => validateImageUpload(upload(PNG, "image/jpeg"))).toThrow(
      "tidak sesuai dengan tipe gambar yang diklaim"
    );
    expect(() => validateImageUpload(upload(JPEG, "image/png"))).toThrow(OcrInputError);
  });

  it("menolak file kosong", () => {
    expect(() => validateImageUpload(upload(new Uint8Array([]), "image/png"))).toThrow(
      "kosong"
    );
  });

  it("menolak file rusak / bukan gambar (magic bytes tak dikenali)", () => {
    expect(() => validateImageUpload(upload(GARBAGE, "image/png"))).toThrow(
      "tidak dikenali"
    );
    expect(() => validateImageUpload(upload(GARBAGE, ""))).toThrow(OcrInputError);
  });

  it("menolak file yang melebihi 10 MB", () => {
    const big = new Uint8Array(MAX_OCR_IMAGE_BYTES + 1);
    big.set(PNG, 0); // tetap PNG valid secara magic bytes
    expect(() => validateImageUpload(upload(big, "image/png"))).toThrow("10 MB");
  });
});
