import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isLLMConfigured } from "@/lib/ai/config";
import type { AiTransaction, ChatMessage } from "@/lib/ai/types";
import { AssistantChat } from "@/components/assistant/chat";

export const metadata = { title: "AI Assistant" };

/**
 * AI CHAT TRANSACTION — TAHAP 4.
 *
 * Halaman = server component: memuat percakapan terakhir + 30 pesan
 * terakhir dari database (RLS aktif), lalu interaksi dilanjutkan oleh
 * client component via API routes.
 * `initialAiStatus` jujur (AI-R2): "simulation" = LLM_API_KEY belum
 * diisi; "unknown" = key ada tetapi belum ada respons yang membuktikan —
 * status "connected" hanya dari hasil provider yang benar-benar berhasil.
 * rule-based BERLABEL, bukan klaim AI sungguhan.
 */
export default async function AssistantPage() {
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

  // Percakapan terakhir milik bisnis ini
  const { data: conversation } = await supabase
    .from("ai_conversations")
    .select("id, title")
    .eq("business_id", business.id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // 30 pesan terakhir dari percakapan tersebut (riwayat masuk chat)
  let initialMessages: ChatMessage[] = [];
  if (conversation) {
    const { data: messages } = await supabase
      .from("ai_messages")
      .select("id, role, content, structured_data")
      .eq("conversation_id", conversation.id)
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
      initialMessages={initialMessages}
      conversationId={conversation?.id ?? null}
      // AI-R2: status awal JUJUR — key ada ≠ terhubung. Status "connected"
      // hanya ditetapkan setelah respons provider benar-benar berhasil.
      initialAiStatus={isLLMConfigured() ? "unknown" : "simulation"}
    />
  );
}
