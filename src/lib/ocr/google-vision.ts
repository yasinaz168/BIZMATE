import type { GoogleServiceAccountCredentials } from "./config";
import { OcrProviderError } from "./provider";
import type { OcrImageInput, OcrProvider, OcrProviderResult } from "./types";

/**
 * PROVIDER GOOGLE CLOUD VISION — Stage B (Google Cloud Vision Provider).
 *
 * Hanya berjalan di SERVER (Node runtime):
 * - Kredensial service account TIDAK PERNAH meninggalkan server — tidak ke
 *   browser, tidak ke respons API, tidak ke log.
 * - Autentikasi memakai google-auth-library (resmi & terpelihara) untuk
 *   penandatanganan JWT service account + caching token — TIDAK membuat
 *   implementasi JWT sendiri.
 * - Memanggil REST resmi Vision: POST /v1/images:annotate
 *   (DOCUMENT_TEXT_DETECTION — cocok untuk nota).
 *
 * Dapat diuji TANPA jaringan/billing: `getAccessToken` dan `fetchFn`
 * disuntikkan lewat `deps`, sehingga unit test memakai mocked auth/fetch
 * dan tidak pernah memanggil Google sungguhan.
 */

const DEFAULT_ENDPOINT = "https://vision.googleapis.com/v1/images:annotate";
const VISION_SCOPE = "https://www.googleapis.com/auth/cloud-vision";

/** Dependensi yang bisa disuntikkan untuk pengujian (mocked auth/fetch) */
export interface GoogleVisionDeps {
  /** Ambil access token Google (default: google-auth-library) */
  getAccessToken: (credentials: GoogleServiceAccountCredentials) => Promise<string>;
  /** Fungsi fetch untuk memanggil Vision REST (default: global fetch) */
  fetchFn: typeof fetch;
}

export interface GoogleVisionOptions {
  /** Endpoint override (default resmi Google). Berguna untuk pengujian. */
  endpoint?: string;
  deps?: Partial<GoogleVisionDeps>;
}

/**
 * Ambil access token memakai google-auth-library (library resmi Google).
 * Library yang menangani penandatanganan JWT service account & caching token.
 */
async function defaultGetAccessToken(
  credentials: GoogleServiceAccountCredentials
): Promise<string> {
  // Import dinamis: library hanya dimuat saat provider ini benar-benar dipakai.
  const { GoogleAuth } = await import("google-auth-library");
  const auth = new GoogleAuth({
    credentials: {
      client_email: credentials.clientEmail,
      private_key: credentials.privateKey,
    },
    scopes: [VISION_SCOPE],
  });
  const token = await auth.getAccessToken();
  if (!token) {
    throw new Error("Access token Google kosong");
  }
  return token;
}

/**
 * Susun pesan AMAN dari error Google.
 *
 * Hanya mengambil `status` (enum aman, mis. PERMISSION_DENIED) dan `code`
 * (angka). TIDAK PERNAH meneruskan `message`/`details` mentah yang bisa
 * memuat ID project, nama resource, atau info internal lain.
 */
function googleErrorSummary(err: { status?: unknown; code?: unknown } | undefined): string {
  const status = typeof err?.status === "string" ? err.status : "";
  const code = typeof err?.code === "number" ? err.code : null;
  const label = status || "UNKNOWN";
  return `Google Vision menolak permintaan: ${label}${code !== null ? ` (kode ${code})` : ""}.`;
}

/** Buat OcrProviderError "failed" dengan pesan yang kita tulis sendiri (aman) */
function providerError(message: string): OcrProviderError {
  return new OcrProviderError(message, "google-vision", "failed");
}

export function createGoogleVisionProvider(
  credentials: GoogleServiceAccountCredentials,
  options: GoogleVisionOptions = {}
): OcrProvider {
  const endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
  const getAccessToken = options.deps?.getAccessToken ?? defaultGetAccessToken;
  const fetchFn = options.deps?.fetchFn ?? fetch;

  return {
    name: "google-vision",
    simulation: false,

    async recognize(image: OcrImageInput): Promise<OcrProviderResult> {
      // 1) Token akses (autentikasi resmi Google). Error auth dibungkus
      //    TANPA meneruskan pesannya — bisa memuat detail kredensial.
      let token: string;
      try {
        token = await getAccessToken(credentials);
      } catch {
        throw providerError(
          "Autentikasi Google Vision gagal — periksa kredensial service account."
        );
      }

      // 2) Payload Vision REST. Base64 dihitung di server, tidak dikirim ke browser.
      const base64 = Buffer.from(image.bytes).toString("base64");
      const body = {
        requests: [
          {
            image: { content: base64 },
            features: [{ type: "DOCUMENT_TEXT_DETECTION", maxResults: 1 }],
            imageContext: { languageHints: ["id", "en"] },
          },
        ],
      };

      // 3) Panggil API. Saat pengujian, fetchFn adalah mock (tanpa jaringan).
      let response: Response;
      try {
        response = await fetchFn(endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });
      } catch {
        throw providerError("Gagal menghubungi Google Vision API.");
      }

      // 4) Parse respons dengan tahan-bentuk (jangan asumsikan selalu JSON valid).
      let payload: unknown = null;
      try {
        payload = await response.json();
      } catch {
        throw providerError("Respons Google Vision tidak dapat dibaca.");
      }

      const outer = (payload ?? {}) as { error?: { status?: unknown; code?: unknown } };

      // Error level API (HTTP tidak sukses / body berisi error utama)
      if (!response.ok || outer.error) {
        throw providerError(
          outer.error
            ? googleErrorSummary(outer.error)
            : `Google Vision menolak permintaan (HTTP ${response.status}).`
        );
      }

      // 5) Ekstraksi teks + confidence dari respons.
      const first = ((payload as { responses?: unknown[] }).responses ?? [])[0] as
        | {
            error?: { status?: unknown; code?: unknown };
            fullTextAnnotation?: { text?: unknown; pages?: Array<{ confidence?: unknown }> };
            textAnnotations?: Array<{ description?: unknown }>;
          }
        | undefined;

      // Error per-gambar dari Vision
      if (first?.error) {
        throw providerError(googleErrorSummary(first.error));
      }

      const fullText =
        typeof first?.fullTextAnnotation?.text === "string" ? first.fullTextAnnotation.text : "";
      const annotationText =
        typeof first?.textAnnotations?.[0]?.description === "string"
          ? (first.textAnnotations[0].description as string)
          : "";
      const rawText = fullText || annotationText;

      // Confidence rata-rata halaman; null bila tidak tersedia (JANGAN dikarang).
      const pages = first?.fullTextAnnotation?.pages ?? [];
      const confidences = pages
        .map((p) => (typeof p?.confidence === "number" ? p.confidence : null))
        .filter((c): c is number => c !== null);
      const confidence =
        confidences.length > 0
          ? confidences.reduce((a, b) => a + b, 0) / confidences.length
          : null;

      // Respons kosong (tidak ada teks terbaca) → rawText "" + confidence null,
      // BUKAN error dan BUKAN nilai karangan.
      return {
        provider: "google-vision",
        simulation: false,
        rawText,
        confidence,
      };
    },
  };
}
