import { getLLMConfig, isLLMConfigured } from "./config";
import type { ChatTransactionResponse } from "./types";
import { parseSimulation } from "./mock-parser";
import { jakartaDaysAgoN, jakartaTodayISO } from "@/lib/time";

/**
 * Pemanggilan LLM — SELALU DI SERVER (API key tidak pernah ke browser).
 *
 * - API kompatibel OpenAI: OpenAI, Groq, OpenRouter, dsb. (LLM_API_BASE_URL).
 * - Keluaran WAJIB JSON tunggal sesuai kontrak ChatTransactionResponse.
 * - TIDAK MENGARANG: prompt melarang menebak; data kurang → tanya balik.
 * - LLM error/timeout → fallback otomatis ke Mode Simulasi (berlabel).
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

export interface LlmResult {
  parsed: ChatTransactionResponse;
  /** true bila asisten berjalan dalam Mode Simulasi (bukan LLM sungguhan) */
  simulationMode: boolean;
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
  // Tanpa API key → Mode Simulasi (jujur: BUKAN LLM sungguhan)
  if (!isLLMConfigured()) {
    const last = [...history].reverse().find((m) => m.role === "user");
    const parsed = parseSimulation(last?.content ?? "");
    return { parsed, simulationMode: true };
  }

  const config = getLLMConfig();
  const todayISO = jakartaTodayISO();
  const yesterdayISO = jakartaDaysAgoN(1);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

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
      throw new Error(`LLM API error ${response.status}`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content ?? "";
    const parsed = parseLlmJson(content);

    if (!parsed) {
      // LLM menjawab tidak sesuai format → simulasi sebagai jaring pengaman
      return {
        parsed: parseSimulation(
          [...history].reverse().find((m) => m.role === "user")?.content ?? ""
        ),
        simulationMode: true,
      };
    }
    return { parsed, simulationMode: false };
  } catch {
    return {
      parsed: parseSimulation(
        [...history].reverse().find((m) => m.role === "user")?.content ?? ""
      ),
      simulationMode: true,
    };
  } finally {
    clearTimeout(timeout);
  }
}
