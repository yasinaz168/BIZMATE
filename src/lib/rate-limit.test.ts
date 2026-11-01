import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkRateLimit,
  checkRateLimitWith,
  evaluateWindows,
  retryAfterFromReset,
  type RateWindow,
  type WindowCheck,
} from "./rate-limit";

/**
 * Pengujian AI-R3.1 — orkestrasi rate limit:
 * - Keputusan akhir dari `limit()` ATOMIK per jendela (Upstash v2 tidak
 *   punya peek terpisah — `limit()` sudah menambah token + memeriksa).
 * - Tidak ada over-admission walau banyak request berbarengan.
 * - Jendela pertama gagal → jendela berikutnya tidak dipanggil.
 * - FAIL-OPEN saat limiter error; nonaktif tanpa konfigurasi.
 * - Log aman: tanpa user id, isi pesan, atau secret.
 */

const USER_ID = "user-123-RAHASIA";
const NOW = 1_700_000_000_000;

function check(success: boolean, resetInMs = 30_000): WindowCheck {
  // reset dihitung dari waktu NYATA — sama seperti respons Upstash
  return {
    success,
    reset: Date.now() + resetInMs,
    limit: 10,
    remaining: success ? 5 : 0,
  };
}

/** Jendela tiruan hasil tetap */
class FakeWindow implements RateWindow {
  constructor(private result: WindowCheck = check(true)) {}
  calls = 0;
  async limit(): Promise<WindowCheck> {
    this.calls += 1;
    return this.result;
  }
}

/**
 * Jendela tiruan ATOMIK ala Upstash: setiap limit() menambah 1 token
 * dalam satu operasi; sukses hanya bila token <= max. Meniru atomisitas
 * Redis sehingga bisa menguji klaim anti-over-admission.
 */
class AtomicCounterWindow implements RateWindow {
  constructor(private max: number) {}
  private used = 0;
  async limit(): Promise<WindowCheck> {
    this.used += 1;
    const success = this.used <= this.max;
    return {
      success,
      reset: Date.now() + 60_000,
      limit: this.max,
      remaining: Math.max(0, this.max - this.used),
    };
  }
}

describe("evaluateWindows — keputusan dari limit() atomik (race-safe)", () => {
  it("semua jendela lolos → diizinkan", async () => {
    const w = new FakeWindow();
    const res = await evaluateWindows([w], USER_ID);
    expect(res.allowed).toBe(true);
    expect(res.outcome).toBe("ok");
    expect(w.calls).toBe(1);
  });

  it("jendela gagal → TERBLOKIR dengan Retry-After; jendela berikutnya tidak dipanggil", async () => {
    const minute = new FakeWindow(check(false, 45_000));
    const day = new FakeWindow(check(true));
    const res = await evaluateWindows([minute, day], USER_ID);
    expect(res.allowed).toBe(false);
    expect(res.outcome).toBe("blocked");
    expect(res.retryAfterSeconds).toBe(45);
    expect(day.calls).toBe(0); // kuota jendela hari tidak terbuang
  });

  it("jendela kedua gagal → tetap TERBLOKIR (AND antar jendela)", async () => {
    const minute = new FakeWindow(check(true));
    const day = new FakeWindow(check(false, 600_000));
    const res = await evaluateWindows([minute, day], USER_ID);
    expect(res.allowed).toBe(false);
    expect(res.retryAfterSeconds).toBe(600);
  });

  it("20 request berbarengan pada batas 2 → TEPAT 2 yang lolos (tanpa over-admission)", async () => {
    const atomic = new AtomicCounterWindow(2);
    const results = await Promise.all(
      Array.from({ length: 20 }, () => evaluateWindows([atomic], USER_ID))
    );
    const allowed = results.filter((r) => r.allowed).length;
    expect(allowed).toBe(2); // atomisitas limit() menjaga batas
  });

  it("identifier yang sama dipakai untuk semua jendela (per user)", async () => {
    const seen: string[] = [];
    const w: RateWindow = {
      limit: async (id) => {
        seen.push(id);
        return check(true);
      },
    };
    await evaluateWindows([w, w], "chat:user-1");
    expect(seen).toEqual(["chat:user-1", "chat:user-1"]);
  });
});

describe("retryAfterFromReset", () => {
  it("menghitung detik sampai reset (minimal 1)", () => {
    expect(retryAfterFromReset(NOW + 30_000, NOW)).toBe(30);
    expect(retryAfterFromReset(NOW + 500, NOW)).toBe(1); // < 1 detik → 1
    expect(retryAfterFromReset(NOW - 5_000, NOW)).toBe(1); // sudah lewat → 1
    expect(retryAfterFromReset(Number.NaN, NOW)).toBe(1); // tidak valid → 1
  });
});

describe("checkRateLimitWith — FAIL-OPEN saat limiter error", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    errorSpy.mockRestore();
  });

  it("jendela melempar error → permintaan DITERUSKAN + log aman", async () => {
    const broken: RateWindow = {
      limit: async () => {
        throw new Error("Redis down untuk user user-123-RAHASIA");
      },
    };

    const res = await checkRateLimitWith("chat", USER_ID, [broken]);
    expect(res.allowed).toBe(true); // fail-open
    expect(res.outcome).toBe("error");

    const log = errorSpy.mock.calls
      .map((call: unknown[]) => call.map((part: unknown) => String(part)).join(" "))
      .join("\n");
    expect(log).toContain("rate_limit");
    expect(log).toContain("error");
    expect(log).not.toContain(USER_ID); // tanpa user id
    expect(log).not.toContain("Redis down"); // tanpa pesan error mentah
  });
});

describe("checkRateLimit — tanpa konfigurasi = nonaktif", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.unstubAllEnvs();
  });
  afterEach(() => {
    errorSpy.mockRestore();
    vi.unstubAllEnvs();
  });

  it("tanpa env Upstash → outcome 'disabled', permintaan diteruskan", async () => {
    const res = await checkRateLimit("chat", USER_ID);
    expect(res.allowed).toBe(true);
    expect(res.outcome).toBe("disabled");
  });

  it("RATE_LIMIT_DISABLED=true menonaktifkan walau env Upstash ada", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://contoh.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "TOKEN-RAHASIA");
    vi.stubEnv("RATE_LIMIT_DISABLED", "true");

    const res = await checkRateLimit("save", USER_ID);
    expect(res.allowed).toBe(true);
    expect(res.outcome).toBe("disabled");

    // token tidak pernah masuk log
    const log = errorSpy.mock.calls
      .map((call: unknown[]) => call.map((part: unknown) => String(part)).join(" "))
      .join("\n");
    expect(log).not.toContain("TOKEN-RAHASIA");
    expect(log).not.toContain(USER_ID);
  });
});
