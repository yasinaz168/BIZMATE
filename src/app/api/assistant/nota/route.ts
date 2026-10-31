import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { registerServerOcrProviders } from "@/lib/ocr/register";
import {
  MAX_OCR_IMAGE_BYTES,
  OcrInputError,
  OcrProviderError,
  recognizeReceiptImage,
} from "@/lib/ocr/provider";
import { validateImageUpload } from "@/lib/ocr/image-validate";
import { structureReceipt } from "@/lib/ocr/structure";
import { logAppError } from "@/lib/server-log";
import type { OcrImageInput } from "@/lib/ocr/types";

/**
 * POST /api/assistant/nota — OCR foto nota (Stage C: Server API Foundation).
 *
 * Alur:
 * 1. Auth (Supabase) — hanya pengguna login.
 * 2. Terima file gambar (multipart form, field "image"/"file").
 * 3. Validasi SERVER-SIDE: ukuran (≤10 MB), MIME type (JPG/PNG/WebP),
 *    dan MAGIC BYTES (bukan sekadar nama file).
 * 4. registerServerOcrProviders() — registrasi provider eksplisit di server
 *    sebelum recognizeReceiptImage().
 * 5. OCR (Stage ini: Mock OCR — belum memanggil Google Vision).
 * 6. Susun draft (ReceiptOcrResult) — field tak terbaca = unread, TIDAK ditebak.
 * 7. Kembalikan DRAFT. API ini TIDAK PERNAH menyimpan transaksi/gambar ke DB.
 *
 * Keamanan: kredensial/OCR hanya di server; respons tidak memuat kredensial
 * atau data internal. Error dicatat aman via logAppError.
 */

// Node.js runtime (bukan Edge) — dibutuhkan untuk fs/crypto & provider server.
export const runtime = "nodejs";

/** Nama field FormData yang diterima untuk file gambar */
const FILE_FIELDS = ["image", "file", "nota", "photo"] as const;

export async function POST(request: Request) {
  // ---------- auth ----------
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Supabase belum dikonfigurasi. Isi .env.local terlebih dahulu." },
      { status: 503 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "Sesi berakhir. Silakan login ulang." },
      { status: 401 }
    );
  }

  // ---------- terima file gambar ----------
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Body harus multipart/form-data dengan field gambar." },
      { status: 400 }
    );
  }

  let file: File | null = null;
  for (const field of FILE_FIELDS) {
    const value = formData.get(field);
    if (value instanceof File) {
      file = value;
      break;
    }
  }

  if (!file) {
    return NextResponse.json(
      { error: "File gambar wajib diunggah (field 'image')." },
      { status: 400 }
    );
  }

  if (file.size === 0) {
    return NextResponse.json({ error: "File gambar kosong." }, { status: 400 });
  }

  // Tolak lebih awal sebelum membaca seluruh buffer (hemat memori)
  if (file.size > MAX_OCR_IMAGE_BYTES) {
    return NextResponse.json(
      {
        error: `Ukuran gambar melebihi batas maksimum ${Math.round(
          MAX_OCR_IMAGE_BYTES / (1024 * 1024)
        )} MB.`,
      },
      { status: 413 }
    );
  }

  // ---------- validasi server (MIME + magic bytes) + proses OCR ----------
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());

    const image: OcrImageInput = validateImageUpload({
      bytes,
      declaredMimeType: file.type,
      fileName: file.name,
    });

    // Registrasi provider OCR secara eksplisit di server SEBELUM dipakai.
    // Stage ini: Mock OCR (tanpa kredensial Google → otomatis mock berlabel).
    registerServerOcrProviders();

    const raw = await recognizeReceiptImage(image);
    const result = structureReceipt(raw);

    // Respons = DRAFT saja. TIDAK menyimpan transaksi/gambar di endpoint ini.
    return NextResponse.json({
      ok: true,
      saved: false, // eksplisit: belum ada yang disimpan, tunggu konfirmasi
      provider: result.provider,
      simulation: result.simulation,
      rawText: result.rawText,
      draft: result.draft,
      warnings: result.warnings,
    });
  } catch (error) {
    if (error instanceof OcrInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof OcrProviderError) {
      logAppError("api/assistant/nota: OCR provider", error);
      return NextResponse.json(
        { error: "Gagal memproses gambar nota. Silakan coba lagi." },
        { status: 502 }
      );
    }
    logAppError("api/assistant/nota: proses gambar", error);
    return NextResponse.json(
      { error: "Terjadi kesalahan saat memproses gambar nota." },
      { status: 500 }
    );
  }
}
