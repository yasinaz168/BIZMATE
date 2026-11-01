import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runAssistant } from "./llm";

/**
 * Pengujian AI-R1 — logging aman pemanggilan LLM:
 * - Setiap kegagalan diklasifikasikan (no_key / timeout / network_error /
 *   http_4xx / http_5xx / parse_error) dan tercatat via logLlmEvent.
 * - Log TIDAK PERNAH memuat API key, Authorization, isi pesan pengguna,
 *   prompt, atau response body.
 * - Fallback ke Mode Simulasi TETAP berjalan seperti perilaku lama.
 */

const SECRET_KEY = "sk-RAHASIA-TEST-XYZ-123-RAHASIA";
const USER_MSG = "Saya jual kopi rahasia pribadi 3 bungkus";
const SECRET_REPLY = "BALASAN-RAHASIA-DARI-PROVIDER";

const HISTORY = [{ role: "user", content: USER_MSG } as const];

let errorSpy: ReturnType<typeof vi.spyOn>;

function loggedText(): string {
  return errorSpy.mock.calls
    .map((call: unknown[]) => call.map((part: unknown) => String(part)).join(" "))
    .join("\n");
}

function stubFetch(response: Partial<Response> | Error) {
  if (response instanceof Error) {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(response);
    return;
  }
  vi.spyOn(globalThis, "fetch").mockResolvedValue(response as Response);
}

function llmReply(content: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content } }] }),
  };
}

beforeEach(() => {
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("runAssistant — tanpa API key (no_key)", () => {
  it("Mode Simulasi tetap jalan, status simulasi benar, tercatat 'no_key'", async () => {
    vi.stubEnv("LLM_API_KEY", ""); // tanpa key
    stubFetch(llmReply(`{"reply":"x","action_type":"none","transaction":null}`));

    const res = await runAssistant([...HISTORY], "Toko");

    expect(res.simulationMode).toBe(true);
    expect(res.parsed.reply).toBeTruthy();
    const log = loggedText();
    expect(log).toContain("llm_call");
    expect(log).toContain("no_key");
    // tanpa key = tidak ada panggilan fetch provider
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

describe("runAssistant — HTTP error provider", () => {
  it("401 (key salah) → fallback simulasi + tercatat http_4xx + status code", async () => {
    vi.stubEnv("LLM_API_KEY", SECRET_KEY);
    stubFetch({ ok: false, status: 401, json: async () => ({ error: SECRET_REPLY }) });

    const res = await runAssistant([...HISTORY], "Toko");

    expect(res.simulationMode).toBe(true);
    const log = loggedText();
    expect(log).toContain("http_4xx");
    expect(log).toContain('"status_code":401');
    expect(log).toContain("llm_call");
  });

  it("429 (kuota) → fallback simulasi + tercatat http_4xx", async () => {
    vi.stubEnv("LLM_API_KEY", SECRET_KEY);
    stubFetch({ ok: false, status: 429, json: async () => ({}) });

    const res = await runAssistant([...HISTORY], "Toko");
    expect(res.simulationMode).toBe(true);
    expect(loggedText()).toContain('"status_code":429');
    expect(loggedText()).toContain("http_4xx");
  });

  it("500 → fallback simulasi + tercatat http_5xx", async () => {
    vi.stubEnv("LLM_API_KEY", SECRET_KEY);
    stubFetch({ ok: false, status: 500, json: async () => ({}) });

    const res = await runAssistant([...HISTORY], "Toko");
    expect(res.simulationMode).toBe(true);
    const log = loggedText();
    expect(log).toContain("http_5xx");
    expect(log).toContain('"status_code":500');
  });
});

describe("runAssistant — timeout & network error", () => {
  it("timeout (AbortError) → fallback simulasi + tercatat 'timeout'", async () => {
    vi.stubEnv("LLM_API_KEY", SECRET_KEY);
    stubFetch(Object.assign(new Error("aborted"), { name: "AbortError" }));

    const res = await runAssistant([...HISTORY], "Toko");
    expect(res.simulationMode).toBe(true);
    expect(loggedText()).toContain("timeout");
  });

  it("network error → fallback simulasi + tercatat 'network_error'", async () => {
    vi.stubEnv("LLM_API_KEY", SECRET_KEY);
    stubFetch(new TypeError("fetch failed"));

    const res = await runAssistant([...HISTORY], "Toko");
    expect(res.simulationMode).toBe(true);
    expect(loggedText()).toContain("network_error");
  });
});

describe("runAssistant — respons tidak valid", () => {
  it("konten bukan JSON → fallback simulasi + tercatat 'parse_error'", async () => {
    vi.stubEnv("LLM_API_KEY", SECRET_KEY);
    stubFetch(llmReply("bukan json sama sekali"));

    const res = await runAssistant([...HISTORY], "Toko");
    expect(res.simulationMode).toBe(true);
    expect(loggedText()).toContain("parse_error");
  });

  it("body HTTP bukan JSON (SyntaxError) → fallback simulasi + 'parse_error'", async () => {
    vi.stubEnv("LLM_API_KEY", SECRET_KEY);
    stubFetch({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("Unexpected token < in JSON");
      },
    });

    const res = await runAssistant([...HISTORY], "Toko");
    expect(res.simulationMode).toBe(true);
    expect(loggedText()).toContain("parse_error");
  });
});

describe("runAssistant — sukses & keamanan log (AI-R1)", () => {
  it("JSON valid → simulationMode false; log mencatat percobaan sukses (bukan kegagalan)", async () => {
    vi.stubEnv("LLM_API_KEY", SECRET_KEY);
    stubFetch(
      llmReply(`{"reply":"halo","action_type":"none","transaction":null}`)
    );

    const res = await runAssistant([...HISTORY], "Toko");
    expect(res.simulationMode).toBe(false);
    expect(res.parsed.reply).toBe("halo");
    const log = loggedText();
    // percobaan tercatat sebagai "ok" (AI-R4: setiap percobaan dicatat aman)
    expect(log).toContain("llm_call");
    expect(log).toContain('"reason":"ok"');
    // TANPA kegagalan apa pun
    for (const failure of ["timeout", "network_error", "http_4xx", "http_5xx", "parse_error"]) {
      expect(log).not.toContain(failure);
    }
  });

  it("log TIDAK memuat API key, Authorization, isi pesan, atau response body", async () => {
    vi.stubEnv("LLM_API_KEY", SECRET_KEY);

    // 401 dengan body berisi "rahasia" provider
    stubFetch({ ok: false, status: 401, json: async () => ({ error: SECRET_REPLY }) });
    await runAssistant([...HISTORY], "Toko");

    // network error
    stubFetch(new TypeError(`fetch failed saat mengirim "${USER_MSG}"`));
    await runAssistant([...HISTORY], "Toko");

    const log = loggedText();
    expect(log).toContain("llm_call"); // logging memang terjadi
    expect(log).not.toContain(SECRET_KEY); // API key tidak bocor
    expect(log).not.toContain("Bearer"); // Authorization tidak bocor
    expect(log).not.toContain("Authorization");
    expect(log).not.toContain(USER_MSG); // isi pesan pengguna tidak bocor
    expect(log).not.toContain("kopi rahasia");
    expect(log).not.toContain(SECRET_REPLY); // response body tidak bocor
    // prompt system tidak bocor
    expect(log).not.toContain("asisten pencatat transaksi");
    // pesan error yang membawa potongan data pun tidak dicetak utuh
    expect(log).not.toContain("fetch failed saat mengirim");
  });

  it("durasi & nama model ikut tercatat (bukan rahasia)", async () => {
    vi.stubEnv("LLM_API_KEY", SECRET_KEY);
    vi.stubEnv("LLM_MODEL", "gpt-4o-mini-uji");
    stubFetch({ ok: false, status: 503, json: async () => ({}) });

    await runAssistant([...HISTORY], "Toko");
    const log = loggedText();
    expect(log).toContain("gpt-4o-mini-uji");
    expect(log).toContain("duration_ms");
    expect(log).toContain('"status_code":503');
    expect(log).toContain("http_5xx");
  });
});

describe("runAssistant — tri-state status AI (AI-R2)", () => {
  it("tanpa key → status 'simulation' + reason 'no_key' (kompatibel simulationMode)", async () => {
    vi.stubEnv("LLM_API_KEY", "");
    const res = await runAssistant([...HISTORY], "Toko");
    expect(res.status).toBe("simulation");
    expect(res.reason).toBe("no_key");
    expect(res.simulationMode).toBe(true); // kompatibilitas lama
  });

  it("provider sukses → status 'connected', tanpa reason", async () => {
    vi.stubEnv("LLM_API_KEY", SECRET_KEY);
    stubFetch(llmReply(`{"reply":"halo","action_type":"none","transaction":null}`));
    const res = await runAssistant([...HISTORY], "Toko");
    expect(res.status).toBe("connected");
    expect(res.reason).toBeUndefined();
    expect(res.simulationMode).toBe(false);
  });

  it("HTTP 401/429/5xx → 'provider_error' dengan reason http_4xx/http_5xx", async () => {
    vi.stubEnv("LLM_API_KEY", SECRET_KEY);

    stubFetch({ ok: false, status: 401, json: async () => ({}) });
    const r401 = await runAssistant([...HISTORY], "Toko");
    expect(r401.status).toBe("provider_error");
    expect(r401.reason).toBe("http_4xx");

    stubFetch({ ok: false, status: 429, json: async () => ({}) });
    const r429 = await runAssistant([...HISTORY], "Toko");
    expect(r429.status).toBe("provider_error");
    expect(r429.reason).toBe("http_4xx");

    stubFetch({ ok: false, status: 500, json: async () => ({}) });
    const r500 = await runAssistant([...HISTORY], "Toko");
    expect(r500.status).toBe("provider_error");
    expect(r500.reason).toBe("http_5xx");
  });

  it("timeout & network error → 'provider_error' dengan reason yang tepat", async () => {
    vi.stubEnv("LLM_API_KEY", SECRET_KEY);

    stubFetch(Object.assign(new Error("aborted"), { name: "AbortError" }));
    const rTimeout = await runAssistant([...HISTORY], "Toko");
    expect(rTimeout.status).toBe("provider_error");
    expect(rTimeout.reason).toBe("timeout");

    stubFetch(new TypeError("fetch failed"));
    const rNetwork = await runAssistant([...HISTORY], "Toko");
    expect(rNetwork.status).toBe("provider_error");
    expect(rNetwork.reason).toBe("network_error");
  });

  it("JSON tidak valid → 'provider_error' reason 'parse_error'", async () => {
    vi.stubEnv("LLM_API_KEY", SECRET_KEY);
    stubFetch(llmReply("bukan json"));
    const res = await runAssistant([...HISTORY], "Toko");
    expect(res.status).toBe("provider_error");
    expect(res.reason).toBe("parse_error");
    expect(res.simulationMode).toBe(true);
  });
});

/* ===================================================================== */
/* AI-R4 — Retry & Reliability (matriks 13 skenario rancangan final)      */
/* ===================================================================== */

/** Respons HTTP tiruan dengan header opsional (untuk Retry-After) */
function httpError(
  status: number,
  retryAfter?: string
): Partial<Response> {
  return {
    ok: false,
    status,
    headers: {
      get: (key: string) =>
        key.toLowerCase() === "retry-after" ? (retryAfter ?? null) : null,
    },
    json: async () => ({}),
  } as unknown as Partial<Response>;
}

function fetchCallCount(): number {
  return vi.mocked(globalThis.fetch).mock.calls.length;
}

describe("AI-R4 — retry untuk error transient (429/502/503/504)", () => {
  beforeEach(() => {
    vi.stubEnv("LLM_API_KEY", SECRET_KEY);
    vi.restoreAllMocks();
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("503 → sukses pada percobaan ke-2: connected, tepat 2 fetch, backoff ≥ 250 ms", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(httpError(503) as Response)
      .mockResolvedValueOnce(
        llmReply(`{"reply":"halo","action_type":"none","transaction":null}`) as Response
      );

    const startedAt = Date.now();
    const res = await runAssistant([...HISTORY], "Toko");
    const elapsed = Date.now() - startedAt;

    expect(res.status).toBe("connected");
    expect(spy).toHaveBeenCalledTimes(2);
    expect(elapsed).toBeGreaterThanOrEqual(250); // backoff jitter minimum
    expect(elapsed).toBeLessThan(2_500); // tetap singkat (maks 750 ms)
    const log = loggedText();
    expect(log).toContain('"reason":"http_5xx"');
    expect(log).toContain('"attempt":1');
    expect(log).toContain('"attempt":2');
    expect(log).toContain('"reason":"ok"');
  });

  it("429 + Retry-After: 1 → dihormati (menunggu ≥ 1 dtk) lalu retry", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(httpError(429, "1") as Response)
      .mockResolvedValueOnce(
        llmReply(`{"reply":"halo","action_type":"none","transaction":null}`) as Response
      );

    const startedAt = Date.now();
    const res = await runAssistant([...HISTORY], "Toko");
    const elapsed = Date.now() - startedAt;

    expect(res.status).toBe("connected");
    expect(spy).toHaveBeenCalledTimes(2);
    expect(elapsed).toBeGreaterThanOrEqual(950); // menunggu Retry-After 1 dtk
    expect(loggedText()).toContain('"status_code":429');
  });

  it("429 + Retry-After: 30 (> 2 dtk) → TANPA retry, langsung fallback", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(httpError(429, "30") as Response);

    const res = await runAssistant([...HISTORY], "Toko");

    expect(spy).toHaveBeenCalledTimes(1); // tidak menahan user
    expect(res.status).toBe("provider_error");
    expect(res.reason).toBe("http_4xx");
  });

  it("502 & 504 juga layak retry; cap TIDAK PERNAH > 2 fetch", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(httpError(502) as Response)
      .mockResolvedValueOnce(httpError(504) as Response)
      .mockResolvedValueOnce(httpError(504) as Response); // cadangan (tidak terpakai)

    const res = await runAssistant([...HISTORY], "Toko");
    expect(spy).toHaveBeenCalledTimes(2); // hard cap 2 percobaan
    expect(res.status).toBe("provider_error");
    expect(res.reason).toBe("http_5xx");
    expect(loggedText()).toContain('"status_code":504');
  });
});

describe("AI-R4 — TANPA retry untuk error non-transient", () => {
  beforeEach(() => {
    vi.stubEnv("LLM_API_KEY", SECRET_KEY);
    vi.restoreAllMocks();
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("400/401/500 → tepat 1 fetch (tanpa retry)", async () => {
    for (const status of [400, 401, 500]) {
      vi.restoreAllMocks();
      errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const spy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(httpError(status) as Response)
        .mockResolvedValueOnce(
          llmReply(`{"reply":"x","action_type":"none","transaction":null}`) as Response
        );

      const res = await runAssistant([...HISTORY], "Toko");
      expect(spy).toHaveBeenCalledTimes(1);
      expect(res.status).toBe("provider_error");
    }
  });

  it("timeout (AbortError) → tepat 1 fetch, TANPA retry", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockRejectedValue(
      Object.assign(new Error("aborted"), { name: "AbortError" })
    );

    const res = await runAssistant([...HISTORY], "Toko");
    expect(spy).toHaveBeenCalledTimes(1);
    expect(res.status).toBe("provider_error");
    expect(res.reason).toBe("timeout");
  });

  it("parse_error (2xx JSON rusak) → tepat 1 fetch, TANPA retry", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(llmReply("bukan json") as Response);

    const res = await runAssistant([...HISTORY], "Toko");
    expect(spy).toHaveBeenCalledTimes(1);
    expect(res.status).toBe("provider_error");
    expect(res.reason).toBe("parse_error");
  });
});

describe("AI-R4 — network error: retry 1× dengan risiko biaya ganda tercatat", () => {
  beforeEach(() => {
    vi.stubEnv("LLM_API_KEY", SECRET_KEY);
    vi.restoreAllMocks();
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("network error → sukses ke-2: connected + log billing_ambiguity 'possible'", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(
        llmReply(`{"reply":"halo","action_type":"none","transaction":null}`) as Response
      );

    const res = await runAssistant([...HISTORY], "Toko");

    expect(res.status).toBe("connected");
    expect(spy).toHaveBeenCalledTimes(2);
    const log = loggedText();
    // risiko biaya ganda DINYATAKAN eksplisit di log (aman)
    expect(log).toContain('"billing_ambiguity":"possible"');
    expect(log).toContain('"reason":"network_error"');
    expect(log).toContain('"reason":"ok"');
  });

  it("network error 2× → provider_error/network_error, tepat 2 fetch", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new TypeError(`fetch failed saat mengirim "${USER_MSG}"`));

    const res = await runAssistant([...HISTORY], "Toko");

    expect(spy).toHaveBeenCalledTimes(2);
    expect(res.status).toBe("provider_error");
    expect(res.reason).toBe("network_error");
    // pesan error yang membawa isi pesan tidak bocor ke log
    expect(loggedText()).not.toContain(USER_MSG);
    expect(loggedText()).not.toContain("fetch failed saat mengirim");
  });
});

describe("AI-R4 — deadline absolut (± 23 dtk)", () => {
  beforeEach(() => {
    vi.stubEnv("LLM_API_KEY", SECRET_KEY);
    vi.restoreAllMocks();
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("budget habis setelah percobaan pertama → percobaan ke-2 DILEWATI (1 fetch)", async () => {
    // Simulasikan waktu berjalan > budget setelah percobaan pertama
    const realNow = Date.now.bind(Date);
    let skew = 0;
    const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => realNow() + skew);

    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementationOnce(async () => {
        skew = 30_000; // percobaan pertama menghabiskan budget
        throw new TypeError("fetch failed");
      })
      .mockResolvedValueOnce(
        llmReply(`{"reply":"halo","action_type":"none","transaction":null}`) as Response
      );

    const res = await runAssistant([...HISTORY], "Toko");

    expect(spy).toHaveBeenCalledTimes(1); // sisa budget < 5 dtk → tanpa retry
    expect(res.status).toBe("provider_error");
    expect(res.reason).toBe("network_error");
    nowSpy.mockRestore();
  });
});
