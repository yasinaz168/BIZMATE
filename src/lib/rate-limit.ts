import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { logRateLimitEvent } from "@/lib/server-log";

/**
 * =====================================================================
 * RATE LIMITING (AI-R3.1) — wrapper Upstash Ratelimit per pengguna.
 * =====================================================================
 * Batas yang disepakati:
 * - chat : 10 permintaan/menit + 200 permintaan/hari per user
 * - save : 20 permintaan/menit per user
 *
 * RACE-SAFE (catatan implementasi penting):
 * Pada @upstash/ratelimit v2 TIDAK ADA operasi "peek" (cek tanpa memotong
 * kuota) yang terpisah — method `limit()` sudah MENAMBAH token DAN memeriksa
 * batas dalam SATU operasi Redis yang atomik. Karena itu:
 * - Keputusan akhir SELALU dari hasil `limit()` atomik — tidak ada pola
 *   "peek lalu consume" yang bisa menyelipkan kelebihan (over-admission)
 *   saat dua request berbarengan.
 * - Untuk dua jendela (menit + hari) keduanya dipanggil `limit()` berurutan
 *   (menit dulu — pemblokir paling sering) dan permintaan diizinkan HANYA
 *   bila keduanya sukses. Sisi buruk terburuk: 1 token jendela kedua
 *   terpakai saat jendela pertama baru saja gagal — pemborosan kecil,
 *   TIDAK PERNAH kelebihan kuota.
 *
 * FAIL-SAFE:
 * - Tanpa konfigurasi (env Upstash kosong / RATE_LIMIT_DISABLED) →
 *   nonaktif: aplikasi lokal & unit test berjalan seperti sebelumnya.
 * - Upstash error/timeout saat runtime → FAIL-OPEN (permintaan diteruskan)
 *   + log aman `rate_limit` outcome "error" — ketersediaan diutamakan.
 *
 * Logging AMAN (logRateLimitEvent): hanya scope/outcome/retry_after —
 * tanpa user id, isi pesan, body, atau secret.
 */

export type RateLimitOutcome = "ok" | "blocked" | "error" | "disabled";

export interface RateLimitDecision {
  /** true hanya bila permintaan boleh diteruskan */
  allowed: boolean;
  outcome: RateLimitOutcome;
  /** saran detik untuk header Retry-After (minimal 1) */
  retryAfterSeconds: number;
}

/** Hasil satu jendela limit (subset dari respons Upstash). */
export interface WindowCheck {
  success: boolean;
  /** timestamp reset jendela (ms) */
  reset: number;
  limit?: number;
  remaining?: number;
}

/**
 * Antarmuka minimal satu jendela limit — memudahkan pengujian.
 * `limit()` WAJIB atomik (tambah token + periksa) seperti Upstash.
 */
export interface RateWindow {
  limit(identifier: string): Promise<WindowCheck>;
}

const MIN_RETRY_SECONDS = 1;

/** Detik saran sampai jendela `reset` dibuka lagi (minimal 1). */
export function retryAfterFromReset(resetMs: number, now = Date.now()): number {
  const seconds = Math.ceil((resetMs - now) / 1000);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : MIN_RETRY_SECONDS;
}

/**
 * Orkestrasi race-safe untuk SATU ATAU LEBIH jendela (mis. menit + hari):
 * setiap jendela dipanggil `limit()` ATOMIK berurutan; permintaan lolos
 * hanya bila SEMUA jendela sukses. Kekalahan race antar-request ditangkap
 * langsung oleh atomisitas `limit()` (hasil `success: false`), sehingga
 * mustahil terjadi over-admission.
 */
export async function evaluateWindows(
  windows: RateWindow[],
  identifier: string
): Promise<RateLimitDecision> {
  for (const window of windows) {
    // operasi atomik: menambah token SEKALIGUS memeriksa batas
    const result = await window.limit(identifier);
    if (!result.success) {
      return {
        allowed: false,
        outcome: "blocked",
        retryAfterSeconds: retryAfterFromReset(result.reset),
      };
    }
  }
  return { allowed: true, outcome: "ok", retryAfterSeconds: MIN_RETRY_SECONDS };
}

/* ------------------------------------------------------------------ */
/* Konfigurasi Upstash                                                  */
/* ------------------------------------------------------------------ */

function isConfigured(): boolean {
  const disabled = (process.env.RATE_LIMIT_DISABLED ?? "").toLowerCase();
  if (disabled === "1" || disabled === "true") return false;
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  );
}

let cachedWindows: Partial<Record<RateLimitScope, RateWindow[]>> | null = null;
let disabledLogged = false;

export type RateLimitScope = "chat" | "save";

/**
 * Jendela per scope (dibuat sekali per proses).
 * - chat: 10/menit + 200/hari (dua jendela sliding window; menit dulu)
 * - save: 20/menit
 */
function getWindows(scope: RateLimitScope): RateWindow[] {
  let windows = cachedWindows;
  if (!windows) {
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL ?? "",
      token: process.env.UPSTASH_REDIS_REST_TOKEN ?? "",
    });
    windows = {
      chat: [
        new Ratelimit({
          redis,
          limiter: Ratelimit.slidingWindow(10, "60 s"),
          prefix: "bizmate:rl:chat:min",
        }),
        new Ratelimit({
          redis,
          limiter: Ratelimit.slidingWindow(200, "24 h"),
          prefix: "bizmate:rl:chat:day",
        }),
      ],
      save: [
        new Ratelimit({
          redis,
          limiter: Ratelimit.slidingWindow(20, "60 s"),
          prefix: "bizmate:rl:save:min",
        }),
      ],
    } as Partial<Record<RateLimitScope, RateWindow[]>>;
    cachedWindows = windows;
  }
  return windows[scope] ?? [];
}

/**
 * Periksa rate limit untuk scope & pengguna tertentu.
 * - Tanpa konfigurasi → outcome "disabled", permintaan diteruskan.
 * - Upstash error → FAIL-OPEN (outcome "error") + log aman.
 * - Identifier internal: `{scope}:{userId}` — tidak pernah dicetak ke log.
 */
export async function checkRateLimit(
  scope: RateLimitScope,
  userId: string
): Promise<RateLimitDecision> {
  if (!isConfigured()) {
    if (!disabledLogged) {
      disabledLogged = true;
      logRateLimitEvent({ scope, outcome: "disabled" });
    }
    return { allowed: true, outcome: "disabled", retryAfterSeconds: MIN_RETRY_SECONDS };
  }
  return checkRateLimitWith(scope, userId, getWindows(scope));
}

/**
 * Variasi dengan jendela injeksi (dipakai unit test) — perilaku identik
 * checkRateLimit: setiap error limiter → FAIL-OPEN + log aman.
 */
export async function checkRateLimitWith(
  scope: RateLimitScope,
  userId: string,
  windows: RateWindow[]
): Promise<RateLimitDecision> {
  try {
    return await evaluateWindows(windows, `${scope}:${userId}`);
  } catch {
    // FAIL-OPEN: limiter bermasalah jangan sampai menurunkan aplikasi.
    logRateLimitEvent({ scope, outcome: "error" });
    return { allowed: true, outcome: "error", retryAfterSeconds: MIN_RETRY_SECONDS };
  }
}
