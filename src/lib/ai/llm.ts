import { getLLMConfig, isLLMConfigured } from "./config";
import { logLlmEvent } from "@/lib/server-log";
import type { AiStatus, AiStatusReason, ChatTransactionResponse } from "./types";
import { parseSimulation } from "./mock-parser";
import { jakartaDaysAgoN, jakartaTodayISO } from "@/lib/time";

/**
 * Pemanggilan LLM — SELALU DI SERVER (API key tidak pernah ke browser).
 *
 * - API kompatibel OpenAI: OpenAI, Groq, OpenRouter, dsb. (LLM_API_BASE_URL).
 * - Keluaran WAJIB JSON tunggal sesuai kontrak ChatTransactionResponse.
 * - TIDAK MENGARANG: prompt melarang menebak; data kurang → tanya balik.
 * - LLM error/timeout → fallback otomatis ke Mode Simulasi (berlabel).
 * - AI-R1: setiap kegagalan/kondisi fallback dicatat AMAN via
 *   logLlmEvent (reason + status code + durasi + model — TANPA key,
 *   TANPA prompt/isi pesan, TANPA response body).
 */

const SYSTEM_PROMPT = (todayISO: string, yesterdayISO: string, businessName: string): string => `Kamu adalah asisten pencatat transaksi untuk UMKM Indonesia (${businessName}).
Tugas: mengubah kalimat Bahasa Indonesia sehari-hari menjadi data transaksi terstruktur untuk pencatatan keuangan.

ATURAN WAJIB (pelanggaran = kesalahan fatal):
1. Tidak pernah MENGARANG angka. Harga, jumlah, tanggal, dan metode bayar hanya boleh diisi jika disebutkan (atau jelas dari konteks percakapan sebelumnya).
2. Data kurang → AJUKAN PERTANYAAN BALIK yang pendek dan jelas. Jangan menebak.
3. Tanggal: hari ini = ${todayISO}, kemarin = ${yesterdayISO} (zona WIB/Asia-Jakarta). Jika pengguna bilang "kemarin" pakai tanggal itu; tanpa keterangan → null.
4. Metode bayar salah satu: cash, transfer, qris, ewallet. Tidak disebut → null.
5. "total Rp X" tanpa jumlah → quantity 1, unit_price = X.
6. Catat sebagai income (pemasukan/penjualan) atau expense (pengeluaran/beli/bayar).
7. jawaban HANYA satu objek JSON valid tanpa teks lain, tanpa markdown:

{"reply":"...","action_type":"none|transaction_ready","transaction":null|{"type":"income|expense","title":"...","quantity":1,"unit_price":0,"payment_method":"cash|transfer|qris|ewallet|null","transacted_at":"YYYY-MM-DD|null","notes":""}}

- "reply" = kalimat hangat untuk pengguna dalam Bahasa Indonesia (maksimal 3 kalimat).
- action_type "transaction_ready" hanya jika transaksi lengkap (type, title, quantity, unit_price).
- judul itu pendek: nama item/jasa, bukan kalimat utuh.`;

interface LlmTurn {
  role: "user" | "assistant";
  content: string;
}

/* ------------------------------------------------------------------ */
/* Retry & reliability (AI-R4) — parameter rancangan final              */
/* ------------------------------------------------------------------ */

/** Maksimum 2 percobaan (1 retry) — hard cap biaya API. */
const MAX_ATTEMPTS = 2;
/** Deadline absolut satu request (ms). */
const TOTAL_BUDGET_MS = 23_000;
/** Timeout per percobaan (ms). */
const ATTEMPT_TIMEOUT_MS = 20_000;
/** Percobaan kedua hanya bila sisa budget ≥ 5 dtk. */
const MIN_REMAINING_FOR_RETRY_MS = 5_000;
/** Retry-After hanya dihormati bila ≤ 2 dtk; lebih → tanpa retry. */
const RETRY_AFTER_MAX_MS = 2_000;
/** Backoff jitter penuh 250–750 ms (anti thundering herd). */
const BACKOFF_MIN_MS = 250;
const BACKOFF_MAX_MS = 750;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffWithJitterMs(): number {
  return BACKOFF_MIN_MS + Math.floor(Math.random() * (BACKOFF_MAX_MS - BACKOFF_MIN_MS + 1));
}

/** Parsing header Retry-After (detik atau HTTP-date) → milidetik. */
export function parseRetryAfterMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  const dateMs = Date.parse(value);
  if (!Number.isNaN(dateMs)) return Math.max(0, dateMs - Date.now());
  return null;
}

/** Status HTTP yang LAYAK di-retry (transient): 429, 502, 503, 504. */
function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

export interface LlmResult {
  parsed: ChatTransactionResponse;
  /** true bila asisten berjalan dalam Mode Simulasi (bukan LLM sungguhan) */
  simulationMode: boolean;
  /**
   * Tri-state AI (AI-R2) — hasil NYATA pemanggilan provider:
   * - "connected"      : provider menjawab dengan JSON valid
   * - "simulation"     : tanpa API key (didesain)
   * - "provider_error" : provider dipanggil tetapi gagal → fallback simulasi
   */
  status: AiStatus;
  /** alasan aman kondisi non-connected (untuk UI & monitoring) */
  reason?: AiStatusReason;
}

/** Buang code fence ```json ... ``` dan petik objek JSON pertama */
function extractJson(raw: string): string | null {
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fence ? fence[1] : raw;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  return body.slice(start, end + 1);
}

function parseLlmJson(raw: string): ChatTransactionResponse | null {
  const json = extractJson(raw);
  if (!json) return null;
  try {
    const obj = JSON.parse(json) as Record<string, unknown>;
    const reply = typeof obj.reply === "string" ? obj.reply : "";
    const action = obj.action_type === "transaction_ready" ? "transaction_ready" : "none";
    const tx = obj.transaction;
    if (action === "transaction_ready" && tx && typeof tx === "object") {
      return {
        reply,
        action_type: "transaction_ready",
        transaction: tx as ChatTransactionResponse["transaction"],
      };
    }
    return { reply, action_type: "none", transaction: null };
  } catch {
    return null;
  }
}

export async function runAssistant(
  history: LlmTurn[],
  businessName: string
): Promise<LlmResult> {
  /** Pesan pengguna terakhir — dipakai parser simulasi (fallback). */
  const lastUserContent = (): string =>
    [...history].reverse().find((m) => m.role === "user")?.content ?? "";

  /** Fallback ke parser simulasi — status membedakan tanpa-key vs provider gagal. */
  const fallbackToSimulation = (
    status: "simulation" | "provider_error",
    reason: AiStatusReason
  ): LlmResult => ({
    parsed: parseSimulation(lastUserContent()),
    simulationMode: true,
    status,
    reason,
  });

  // Tanpa API key → Mode Simulasi (jujur: BUKAN LLM sungguhan)
  if (!isLLMConfigured()) {
    logLlmEvent({ reason: "no_key" });
    return fallbackToSimulation("simulation", "no_key");
  }

  const config = getLLMConfig();
  const todayISO = jakartaTodayISO();
  const yesterdayISO = jakartaDaysAgoN(1);

  // ---- Retry loop (AI-R4) — maksimum 2 percobaan dalam 1 request user ----
  // Jaminan: retry hanya memanggil ulang FETCH (read-only) — tidak pernah
  // mengulang insert pesan dan tidak menyentuh rate limiter (keduanya di
  // route.ts, di luar fungsi ini).
  const deadline = Date.now() + TOTAL_BUDGET_MS;
  let lastReason: AiStatusReason = "network_error";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    // Percobaan kedua hanya bila sisa budget mencukupi (deadline absolut).
    const remaining = deadline - Date.now();
    if (attempt > 1 && remaining < MIN_REMAINING_FOR_RETRY_MS) {
      break;
    }
    const attemptTimeoutMs = Math.min(ATTEMPT_TIMEOUT_MS, remaining - 250);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), attemptTimeoutMs);
    const attemptStartedAt = Date.now();
    const durationMs = (): number => Date.now() - attemptStartedAt;

    try {
      const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          temperature: 0.2,
          max_tokens: 400,
          messages: [
            {
              role: "system",
              content: SYSTEM_PROMPT(todayISO, yesterdayISO, businessName),
            },
            ...history.slice(-14).map((m) => ({
              role: m.role,
              content: m.content,
            })),
          ],
        }),
      });

      if (!response.ok) {
        // Provider menolak / error. HANYA 429/502/503/504 yang layak retry.
        const reason: AiStatusReason =
          response.status >= 500 ? "http_5xx" : "http_4xx";
        lastReason = reason;

        const retryAfterMs = parseRetryAfterMs(
          (response.headers as Headers | undefined)?.get?.("Retry-After")
        );
        // 429 dengan Retry-After > 2 dtk → JANGAN retry (tahan user terlalu
        // lama); header absen → boleh retry dengan jitter.
        const retryAllowed =
          attempt < MAX_ATTEMPTS &&
          isRetryableStatus(response.status) &&
          (retryAfterMs === null || retryAfterMs <= RETRY_AFTER_MAX_MS);

        logLlmEvent({
          reason,
          statusCode: response.status,
          durationMs: durationMs(),
          model: config.model,
          attempt,
        });

        if (retryAllowed) {
          await sleep(retryAfterMs ?? backoffWithJitterMs());
          continue;
        }
        return fallbackToSimulation("provider_error", reason);
      }

      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = payload.choices?.[0]?.message?.content ?? "";
      const parsed = parseLlmJson(content);

      if (!parsed) {
        // LLM menjawab tidak sesuai format/kontrak → JANGAN retry (sumber
        // daya model cenderung mengulang output yang sama) → simulasi.
        logLlmEvent({
          reason: "parse_error",
          durationMs: durationMs(),
          model: config.model,
          attempt,
        });
        return fallbackToSimulation("provider_error", "parse_error");
      }

      // connected HANYA untuk respons provider yang sukses, terparse, dan
      // memenuhi kontrak ChatTransactionResponse (AI-R2).
      logLlmEvent({
        reason: "ok",
        durationMs: durationMs(),
        model: config.model,
        attempt,
      });
      return { parsed, simulationMode: false, status: "connected" };
    } catch (error) {
      const name = (error as { name?: unknown })?.name;

      if (name === "AbortError") {
        // Timeout: JANGAN retry — 20 dtk sudah terbuang; retry menambah
        // waktu & risiko biaya tanpa jaminan hasil lebih baik.
        logLlmEvent({
          reason: "timeout",
          durationMs: durationMs(),
          model: config.model,
          attempt,
        });
        return fallbackToSimulation("provider_error", "timeout");
      }

      if (name === "SyntaxError") {
        // Body bukan JSON valid → sama dengan parse_error, tanpa retry.
        logLlmEvent({
          reason: "parse_error",
          durationMs: durationMs(),
          model: config.model,
          attempt,
        });
        return fallbackToSimulation("provider_error", "parse_error");
      }

      // Network TypeError (koneksi terputus/dll.): TIDAK terjamin request
      // tidak sampai — provider MUNGKIN sudah memproses/menagih (biaya
      // ambigu). Retry maksimal 1× diperbolehkan; risiko biaya ganda
      // dicatat aman via billing_ambiguity: "possible".
      lastReason = "network_error";
      logLlmEvent({
        reason: "network_error",
        durationMs: durationMs(),
        model: config.model,
        attempt,
        billing_ambiguity: "possible",
      });

      if (attempt < MAX_ATTEMPTS) {
        await sleep(backoffWithJitterMs());
        continue;
      }
      return fallbackToSimulation("provider_error", "network_error");
    } finally {
      clearTimeout(timeout);
    }
  }

  // Budget habis / seluruh percobaan gagal → fallback dengan alasan
  // percobaan TERAKHIR (konsisten dengan status transparency AI-R2).
  return fallbackToSimulation("provider_error", lastReason);
}
