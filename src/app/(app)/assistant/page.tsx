import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isLLMConfigured } from "@/lib/ai/config";
import type {
  AiTransaction,
  ChatMessage,
  ConversationSummary,
} from "@/lib/ai/types";
import { AssistantChat } from "@/components/assistant/chat";

export const metadata = { title: "AI Assistant" };

/**
 * AI CHAT TRANSACTION — TAHAP 4 + daftar percakapan (P4.1).
 *
 * Halaman = server component: memuat DAFTAR percakapan milik bisnis ini
 * (dibatasi server) + pesan percakapan yang terpilih; interaksi dilanjutkan
 * oleh client component via API routes.
 *
 * KEAMANAN P4.1:
 * - business_id = hasil lookup `businesses.owner_id = user.id` di server.
 * - `conversation` dari searchParams TIDAK PERNAH dipercaya langsung:
 *   diquery ulang dengan `.eq("id", …).eq("business_id", business.id)`.
 *   ID milik bisnis lain / tidak valid → fallback ke percakapan terbaru
 *   tanpa membocorkan keberadaannya.
 * `initialAiStatus` jujur (AI-R2): "simulation" = LLM_API_KEY belum
 * diisi; "unknown" = key ada tetapi belum ada respons yang membuktikan —
 * status "connected" hanya dari hasil provider yang benar-benar berhasil.
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AssistantPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: business } = await supabase
    .from("businesses")
    .select("id, name")
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!business) redirect("/onboarding");

  const params = await searchParams;
  const requestedRaw = params?.conversation;
  const requestedId =
    typeof requestedRaw === "string" && UUID_RE.test(requestedRaw.trim())
      ? requestedRaw.trim()
      : "";

  // ---------- daftar percakapan milik bisnis ini (P4.1) ----------
  const { data: conversationRows } = await supabase
    .from("ai_conversations")
    .select("id, title, created_at, updated_at")
    .eq("business_id", business.id)
    .order("updated_at", { ascending: false })
    .limit(20);

  const conversations: ConversationSummary[] = (conversationRows ?? []).map(
    (row: Record<string, unknown>) => ({
      id: String(row.id ?? ""),
      title: typeof row.title === "string" ? row.title : null,
      created_at: String(row.created_at ?? ""),
      updated_at: String(row.updated_at ?? ""),
    })
  );

  // ---------- percakapan terpilih ----------
  // Param hanya dipercaya SETELAH diverifikasi milik bisnis ini;
  // tidak valid / milik orang lain → fallback ke percakapan terbaru.
  let selectedConversation: ConversationSummary | null = null;
  if (requestedId) {
    const { data: owned } = await supabase
      .from("ai_conversations")
      .select("id, title, created_at, updated_at")
      .eq("id", requestedId)
      .eq("business_id", business.id)
      .maybeSingle();
    if (owned) {
      selectedConversation = {
        id: String(owned.id ?? ""),
        title: typeof owned.title === "string" ? owned.title : null,
        created_at: String(owned.created_at ?? ""),
        updated_at: String(owned.updated_at ?? ""),
      };
    }
  }
  if (!selectedConversation) {
    selectedConversation = conversations[0] ?? null;
  }

  // ---------- 30 pesan terakhir dari percakapan terpilih ----------
  let initialMessages: ChatMessage[] = [];
  if (selectedConversation) {
    const { data: messages } = await supabase
      .from("ai_messages")
      .select("id, role, content, structured_data")
      .eq("conversation_id", selectedConversation.id)
      .order("created_at", { ascending: false })
      .limit(30);

    initialMessages = (messages ?? [])
      .reverse()
      .map((m) => {
        const data = m.structured_data as {
          transaction?: AiTransaction;
          simulation_mode?: boolean;
        } | null;
        return {
          id: m.id,
          role: m.role as "user" | "assistant",
          content: m.content,
          transaction: data?.transaction ?? null,
          // Status per pesan dari riwayat DB (flag lama hanya simulation_mode —
          // tidak membedakan provider_error; dikembalikan apa adanya).
          aiStatus:
            data?.simulation_mode === undefined
              ? undefined
              : data.simulation_mode
                ? "simulation"
                : "connected",
        };
      });
  }

  return (
    <AssistantChat
      // R1 (bug riwayat percakapan): key berdasarkan percakapan terpilih
      // WAJIB — perpindahan URL /assistant?conversation=X → =Y harus
      // MEREMOUNT komponen agar useState memakai props (pesan/id) hasil
      // load server terbaru; tanpa key, state lama menimpa data server.
      // Fallback "baru" = konteks percakapan baru (belum ada id).
      key={selectedConversation?.id ?? "baru"}
      initialMessages={initialMessages}
      conversationId={selectedConversation?.id ?? null}
      // AI-R2: status awal JUJUR — key ada ≠ terhubung. Status "connected"
      // hanya ditetapkan setelah respons provider benar-benar berhasil.
      initialAiStatus={isLLMConfigured() ? "unknown" : "simulation"}
      conversationList={conversations}
    />
  );
}
