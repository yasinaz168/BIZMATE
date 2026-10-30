import { jakartaTodayISO, jakartaDaysAgoN } from "@/lib/time";

/**
 * Cek apakah LLM API tersedia. Jika tidak → Mode Simulasi.
 * Key dibaca dari environment variables (server-side).
 */
export function isLLMConfigured(): boolean {
  return Boolean(process.env.LLM_API_KEY);
}

export function getLLMConfig() {
  return {
    apiKey: process.env.LLM_API_KEY ?? "",
    baseUrl: (process.env.LLM_API_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, ""),
    model: process.env.LLM_MODEL || "gpt-4o-mini",
  };
}
