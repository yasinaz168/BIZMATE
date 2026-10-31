import { describe, expect, it } from "vitest";
import { createGoogleVisionProvider } from "./google-vision";
import { OcrProviderError } from "./provider";
import type { GoogleServiceAccountCredentials } from "./config";
import type { OcrImageInput } from "./types";

/**
 * Pengujian Google Vision Provider (Stage B) — MEMAKAI MOCKED FETCH/AUTH.
 *
 * Tidak ada panggilan jaringan, tidak ada billing, tidak ada kredensial
 * sungguhan. `getAccessToken` & `fetchFn` disuntikkan sebagai mock.
 *
 * Dijaga:
 * - Respons sukses, respons kosong, error autentikasi, error API Google.
 * - Kredensial TIDAK PERNAH bocor ke pesan error / hasil / log.
 */

// Kredensial PALSU untuk pengujian — bukan milik siapa pun.
const FAKE_CREDS: GoogleServiceAccountCredentials = {
  clientEmail: "bizmate-ocr-service@bizmate-ocr.iam.gserviceaccount.com",
  privateKey: "-----BEGIN PRIVATE KEY-----\nRAHASIA-PRIBADI-XYZ-123\n-----END PRIVATE KEY-----\n",
  projectId: "bizmate-ocr",
  keyFile: null,
};
const RAHASIA_MARKERS = ["RAHASIA-PRIBADI-XYZ-123", "bizmate-ocr-service@"];

const PNG: OcrImageInput = { bytes: new Uint8Array([1, 2, 3]), mimeType: "image/png" };

/** Fetch mock yang mengembalikan JSON body dengan status tertentu */
function jsonFetch(body: unknown, status: number): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    })) as unknown as typeof fetch;
}

const SUCCESS_BODY = {
  responses: [
    {
      fullTextAnnotation: {
        text: "NOTA TOKO BERKAH\nTOTAL 165000",
        pages: [{ confidence: 0.9 }, { confidence: 0.7 }],
      },
    },
  ],
};

describe("Google Vision — respons sukses", () => {
  it("mengekstrak teks & confidence, menyatakan dirinya nyata (bukan simulasi)", async () => {
    let sentUrl = "";
    let sentBody = "";
    const provider = createGoogleVisionProvider(FAKE_CREDS, {
      deps: {
        getAccessToken: async () => "TOKEN-PALSU",
        fetchFn: (async (url: string | URL | Request, init?: RequestInit) => {
          sentUrl = String(url);
          sentBody = String(init?.body ?? "");
          return new Response(JSON.stringify(SUCCESS_BODY), { status: 200 });
        }) as unknown as typeof fetch,
      },
    });

    const result = await provider.recognize(PNG);

    expect(result.provider).toBe("google-vision");
    expect(result.simulation).toBe(false); // klaim nyata — karena memang provider nyata
    expect(result.rawText).toContain("TOTAL 165000");
    expect(result.confidence).toBeCloseTo(0.8, 5); // rata-rata 0.9 & 0.7
    // Endpoint & payload yang benar
    expect(sentUrl).toContain("images:annotate");
    expect(sentBody).toContain("DOCUMENT_TEXT_DETECTION");
    expect(sentBody).toContain(Buffer.from(PNG.bytes).toString("base64"));
  });

  it("mengirim Authorization Bearer token ke Google", async () => {
    let authHeader = "";
    const provider = createGoogleVisionProvider(FAKE_CREDS, {
      deps: {
        getAccessToken: async () => "TOKEN-PALSU",
        fetchFn: (async (_url: string | URL | Request, init?: RequestInit) => {
          authHeader = (init?.headers as Record<string, string>)?.Authorization ?? "";
          return new Response(JSON.stringify(SUCCESS_BODY), { status: 200 });
        }) as unknown as typeof fetch,
      },
    });
    await provider.recognize(PNG);
    expect(authHeader).toBe("Bearer TOKEN-PALSU");
  });
});

describe("Google Vision — respons kosong", () => {
  it("respons tanpa teks → rawText '' & confidence null, TIDAK error, TIDAK mengarang", async () => {
    const provider = createGoogleVisionProvider(FAKE_CREDS, {
      deps: {
        getAccessToken: async () => "TOKEN-PALSU",
        fetchFn: jsonFetch({ responses: [{}] }, 200),
      },
    });
    const result = await provider.recognize(PNG);
    expect(result.rawText).toBe("");
    expect(result.confidence).toBeNull();
    expect(result.simulation).toBe(false);
  });

  it("tanpa fullTextAnnotation → jatuh ke textAnnotations bila ada", async () => {
    const provider = createGoogleVisionProvider(FAKE_CREDS, {
      deps: {
        getAccessToken: async () => "TOKEN-PALSU",
        fetchFn: jsonFetch(
          { responses: [{ textAnnotations: [{ description: "TEKS RINGKAS" }] }] },
          200
        ),
      },
    });
    const result = await provider.recognize(PNG);
    expect(result.rawText).toBe("TEKS RINGKAS");
    expect(result.confidence).toBeNull();
  });
});

describe("Google Vision — error autentikasi", () => {
  it("kegagalan token dibungkus OcrProviderError tanpa membocorkan kredensial", async () => {
    const provider = createGoogleVisionProvider(FAKE_CREDS, {
      deps: {
        getAccessToken: async () => {
          throw new Error(`jwt invalid for ${FAKE_CREDS.clientEmail} key=${FAKE_CREDS.privateKey}`);
        },
        fetchFn: jsonFetch({}, 200),
      },
    });

    let thrown: unknown;
    try {
      await provider.recognize(PNG);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(OcrProviderError);
    const err = thrown as OcrProviderError;
    expect(err.code).toBe("failed");
    expect(err.providerName).toBe("google-vision");
    expect(err.message).toContain("Autentikasi Google Vision gagal");
    for (const marker of RAHASIA_MARKERS) {
      expect(err.message).not.toContain(marker);
    }
  });
});

describe("Google Vision — error API Google", () => {
  it("error level API disanitasi: hanya status enum, BUKAN pesan/detail mentah", async () => {
    // Body error Google yang sengaja memuat info sensitif di message & details
    const provider = createGoogleVisionProvider(FAKE_CREDS, {
      deps: {
        getAccessToken: async () => "TOKEN-PALSU",
        fetchFn: jsonFetch(
          {
            error: {
              code: 403,
              status: "PERMISSION_DENIED",
              message: `API key tidak valid project=bizmate-ocr email=${FAKE_CREDS.clientEmail}`,
              details: [{ reason: "RAHASIA-PRIBADI-XYZ-123" }],
            },
          },
          403
        ),
      },
    });

    let thrown: unknown;
    try {
      await provider.recognize(PNG);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(OcrProviderError);
    const err = thrown as OcrProviderError;
    // Status enum & kode AMAN disertakan untuk diagnosis
    expect(err.message).toContain("PERMISSION_DENIED");
    expect(err.message).toContain("403");
    // Pesan/detail mentah Google TIDAK diteruskan
    expect(err.message).not.toContain("API key tidak valid");
    for (const marker of RAHASIA_MARKERS) {
      expect(err.message).not.toContain(marker);
    }
  });

  it("error per-gambar (responses[0].error) juga disanitasi", async () => {
    const provider = createGoogleVisionProvider(FAKE_CREDS, {
      deps: {
        getAccessToken: async () => "TOKEN-PALSU",
        fetchFn: jsonFetch(
          {
            responses: [
              { error: { code: 8, status: "RESOURCE_EXHAUSTED", message: "quota RAHASIA-PRIBADI-XYZ-123" } },
            ],
          },
          200
        ),
      },
    });

    let thrown: unknown;
    try {
      await provider.recognize(PNG);
    } catch (e) {
      thrown = e;
    }
    const err = thrown as OcrProviderError;
    expect(err.message).toContain("RESOURCE_EXHAUSTED");
    expect(err.message).not.toContain("quota");
    expect(err.message).not.toContain("RAHASIA-PRIBADI-XYZ-123");
  });

  it("HTTP error tanpa body error → pesan generik dengan kode HTTP saja", async () => {
    const provider = createGoogleVisionProvider(FAKE_CREDS, {
      deps: {
        getAccessToken: async () => "TOKEN-PALSU",
        fetchFn: jsonFetch({}, 500),
      },
    });
    await expect(provider.recognize(PNG)).rejects.toBeInstanceOf(OcrProviderError);
  });

  it("kegagalan jaringan → OcrProviderError tanpa detail", async () => {
    const provider = createGoogleVisionProvider(FAKE_CREDS, {
      deps: {
        getAccessToken: async () => "TOKEN-PALSU",
        fetchFn: (async () => {
          throw new Error("ECONNREFUSED RAHASIA-PRIBADI-XYZ-123");
        }) as unknown as typeof fetch,
      },
    });

    let thrown: unknown;
    try {
      await provider.recognize(PNG);
    } catch (e) {
      thrown = e;
    }
    const err = thrown as OcrProviderError;
    expect(err.message).not.toContain("RAHASIA-PRIBADI-XYZ-123");
    expect(err.message).not.toContain("ECONNREFUSED");
  });
});

describe("Google Vision — kredensial tidak bocor", () => {
  it("hasil sukses tidak memuat kredensial", async () => {
    const provider = createGoogleVisionProvider(FAKE_CREDS, {
      deps: {
        getAccessToken: async () => "TOKEN-PALSU",
        fetchFn: jsonFetch(SUCCESS_BODY, 200),
      },
    });
    const result = await provider.recognize(PNG);
    const flat = JSON.stringify(result);
    for (const marker of RAHASIA_MARKERS) {
      expect(flat).not.toContain(marker);
    }
    expect(flat).not.toContain("TOKEN-PALSU"); // token pun tidak ikut di hasil
  });

  it("objek provider tidak menyimpan kredensial dalam bentuk yang bisa ter-serialize bebas", async () => {
    const provider = createGoogleVisionProvider(FAKE_CREDS, {
      deps: { getAccessToken: async () => "TOKEN-PALSU", fetchFn: jsonFetch(SUCCESS_BODY, 200) },
    });
    // Serialize seluruh objek provider (nama & method) — pastikan tidak ada privateKey
    const flat = JSON.stringify(provider, (key, value) =>
      typeof value === "function" ? "[fn]" : value
    );
    expect(flat).not.toContain("RAHASIA-PRIBADI-XYZ-123");
    expect(flat).not.toContain("BEGIN PRIVATE KEY");
  });
});
