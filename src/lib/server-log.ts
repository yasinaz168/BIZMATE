/**
 * LOGGING ERROR SERVER — terstruktur & minimalis (tahap 2 perbaikan audit).
 *
 * Aturan privasi yang DIJAGA (audit /api/assistant/chat):
 * - HANYA mencatat: kode error database, pesan error sistem, dan lokasi
 *   operasi (route + tabel + jenis operasi).
 * - TIDAK PERNAH mencatat: isi pesan pengguna, data transaksi pribadi,
 *   API key, token, password, atau isi .env.local.
 * - Error database datang sebagai objek bebas (mis. PostgRESTError) yang
 *   bisa berisi field sensitif seperti `details` (memuat nilai baris,
 *   contoh: "Key (title)=(judul rahasia)") — field SELAIN code & message
 *   TIDAK pernah dibaca, sehingga mustahil ikut tercatat.
 * - Pesan disanitasi: karakter kontrol/di-baru dibuang (cegah log
 *   injection) dan dipotong agar log tetap ringkas.
 */

/** Lokasi operasi database yang sedang dicatat */
export interface DbErrorContext {
  /** Route handler tempat operasi, mis. "api/assistant/chat" */
  route: string;
  /** Tabel tujuan, mis. "ai_messages" */
  table: string;
  /** Jenis operasi database */
  op: "insert" | "update" | "delete" | "select";
  /** Penanda langkah opsional, mis. "pesan pengguna" */
  step?: string;
}

const MAX_TEXT = 300;

/** Buang karakter kontrol & newline (cegah log injection), rapikan, potong */
function sanitize(value: unknown, max = MAX_TEXT): string {
  if (typeof value !== "string" || value.length === 0) return "";
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, max);
}

/**
 * Catat error database secara terstruktur (satu baris JSON di log server).
 *
 * Parameter sengaja bertipe `unknown`: objek error dari PostgREST bisa
 * membawa field sensitif (`details` memuat nilai baris, `hint`, dsb.), dan
 * fungsi ini HANYA menyentuh dua key — `code` dan `message` — sehingga
 * field lain mustahil ikut tercatat.
 */
export function logDbError(context: DbErrorContext, error: unknown): void {
  const err: Record<string, unknown> =
    typeof error === "object" && error !== null
      ? (error as Record<string, unknown>)
      : {};
  const entry = {
    event: "db_error",
    at: new Date().toISOString(),
    route: sanitize(context.route, 120),
    table: sanitize(context.table, 120),
    op: sanitize(context.op, 20),
    step: sanitize(context.step, 120),
    code: sanitize(err.code, 40) || "unknown",
    message: sanitize(err.message) || "(tanpa pesan)",
  };
  console.error("[db-error]", JSON.stringify(entry));
}

/**
 * Catat exception tak terduga secara aman.
 *
 * Error dicetak sebagai nama + pesan yang sudah disanitasi — TIDAK pernah
 * dicetak utuh, karena objek exception bisa saja membawa data di field
 * tambahannya.
 */
export function logAppError(operation: string, error: unknown): void {
  const name = error instanceof Error ? error.name : typeof error;
  const message = error instanceof Error ? sanitize(error.message) : "";
  const entry = {
    event: "app_error",
    at: new Date().toISOString(),
    operation: sanitize(operation, 120),
    name: sanitize(name, 80) || "unknown",
    message: message || "(tanpa pesan)",
  };
  console.error("[app-error]", JSON.stringify(entry));
}

/* ===================================================================== */
/* LOG PEMANGGILAN LLM (AI-R1) — monitoring aman                          */
/* ===================================================================== */

/**
 * Kategori kondisi pemanggilan LLM:
 * - ok           : provider menjawab dengan JSON valid (tidak dicatat —
 *                  hanya kegagalan/kondisi fallback yang dicatat)
 * - no_key       : LLM_API_KEY tidak tersedia (Mode Simulasi memang
 *                  didesain, tapi dicatat agar terlihat siapa yang
 *                  berjalan tanpa AI sungguhan)
 * - timeout      : request dibatalkan AbortController (melewati batas)
 * - network_error: fetch gagal (DNS/koneksi/dll.)
 * - http_4xx     : provider menolak (401 key salah, 429 kuota, dst.)
 * - http_5xx     : provider error sisi server
 * - parse_error  : respons bukan/berisi JSON tidak valid
 */
export type LlmEventReason =
  | "ok"
  | "no_key"
  | "timeout"
  | "network_error"
  | "http_4xx"
  | "http_5xx"
  | "parse_error";

export interface LlmEventInput {
  reason: LlmEventReason;
  /** status HTTP bila tersedia — HANYA angka, bukan body/header */
  statusCode?: number;
  /** durasi panggilan dalam milidetik bila tersedia */
  durationMs?: number;
  /** nama model yang dipakai (bukan rahasia) — tetap disanitasi */
  model?: string;
  /** nomor percobaan (1..N) — retry internal AI-R4 */
  attempt?: number;
  /**
   * "possible" = kegagalan jaringan di mana provider MUNGKIN sudah
   * memproses/menagih request (biaya ambigu) — dipakai saat retry
   * network agar risiko biaya ganda terpantau aman di log.
   */
  billing_ambiguity?: "possible";
}

/**
 * Catat kondisi pemanggilan LLM secara AMAN (AI-R1 + AI-R4).
 *
 * Yang dicetak HANYA: reason, status code, durasi, nama model, nomor
 * percobaan, penanda billing ambigu.
 * TIDAK PERNAH: API key, Authorization header, request body, prompt,
 * isi pesan pengguna, atau response body.
 *
 * Logging TIDAK BOLEH menggagalkan respons AI → seluruh badan dibungkus
 * try/catch.
 */
export function logLlmEvent(input: LlmEventInput): void {
  try {
    const statusCode =
      typeof input.statusCode === "number" &&
      Number.isFinite(input.statusCode)
        ? Math.round(input.statusCode)
        : undefined;
    const durationMs =
      typeof input.durationMs === "number" &&
      Number.isFinite(input.durationMs)
        ? Math.round(Math.min(Math.max(input.durationMs, 0), 600_000))
        : undefined;
    const attempt =
      typeof input.attempt === "number" && Number.isFinite(input.attempt)
        ? Math.min(Math.max(Math.round(input.attempt), 1), 10)
        : undefined;
    const entry: Record<string, unknown> = {
      event: "llm_call",
      at: new Date().toISOString(),
      reason: sanitize(input.reason, 40) || "unknown",
    };
    if (statusCode !== undefined) entry.status_code = statusCode;
    if (durationMs !== undefined) entry.duration_ms = durationMs;
    if (input.model) entry.model = sanitize(input.model, 60);
    if (attempt !== undefined) entry.attempt = attempt;
    if (input.billing_ambiguity) {
      entry.billing_ambiguity = sanitize(input.billing_ambiguity, 20);
    }
    console.error("[llm-event]", JSON.stringify(entry));
  } catch {
    // logging tidak boleh menggagalkan alur AI
  }
}

/* ===================================================================== */
/* LOG RATE LIMITING (AI-R3) — monitoring aman                            */
/* ===================================================================== */

export interface RateLimitEventInput {
  /** cakupan limit: "chat" | "save" */
  scope: string;
  /** hasil: "blocked" | "error" | "disabled" */
  outcome: string;
  /** saran detik sebelum mencoba lagi (untuk Retry-After) */
  retryAfterSeconds?: number;
}

/**
 * Catat kejadian rate limiting secara AMAN (AI-R3).
 *
 * Yang dicetak HANYA: scope, outcome, retry_after. TIDAK PERNAH: user id,
 * email, isi percakapan/pesan, request body, token, atau secret apa pun.
 * Logging tidak boleh menggagalkan respons → dibungkus try/catch.
 */
export function logRateLimitEvent(input: RateLimitEventInput): void {
  try {
    const entry: Record<string, unknown> = {
      event: "rate_limit",
      at: new Date().toISOString(),
      scope: sanitize(input.scope, 20) || "unknown",
      outcome: sanitize(input.outcome, 20) || "unknown",
    };
    if (
      typeof input.retryAfterSeconds === "number" &&
      Number.isFinite(input.retryAfterSeconds)
    ) {
      entry.retry_after = Math.max(1, Math.round(input.retryAfterSeconds));
    }
    console.error("[rate-limit]", JSON.stringify(entry));
  } catch {
    // logging tidak boleh menggagalkan alur
  }
}
