import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { runAssistant } from "@/lib/ai/llm";
import { validateTransaction } from "@/lib/ai/validate";
import type { ChatMessage } from "@/lib/ai/types";

/**
 * POST /api/assistant/chat
 *
 * Alur:
 * 1. Auth + bisnis (RLS aktif — hanya data milik pengguna ini).
 * 2. Verifikasi conversationId milik pengguna; bila tidak → buang.
 * 3. Muat riwayat ≤ 14 pesan; buat conversation baru bila perlu.
 * 4. Simpan pesan pengguna, panggil LLM (atau Mode Simulasi berlabel).
 * 5. Simpan balasan assistant (+ structured_data) dan kembalikan intent —
 *    TIDAK MENYIMPAN TRANSAKSI di sini. Simpan hanya via /api/assistant/save
 *    setelah konfirmasi pengguna.
 */

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Supabase belum dikonfigurasi. Isi .env.local terlebih dahulu." },
      { status: 503 }
    );
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sesi berakhir. Silakan login ulang." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    message?: unknown;
    conversationId?: unknown;
  } | null;

  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (message.length === 0 || message.length > 1000) {
    return NextResponse.json(
      { error: "Pesan wajib diisi (maksimal 1000 karakter)." },
      { status: 400 }
    );
  }

  // ---------- bisnis ----------
  const { data: business } = await supabase
    .from("businesses")
    .select("id, name")
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!business) {
    return NextResponse.json({ error: "Profil bisnis belum ada." }, { status: 409 });
  }

  // ---------- conversation (verifikasi kepemilikan) ----------
  let conversationId: string | null = null;
  if (typeof body?.conversationId === "string") {
    const { data: convo } = await supabase
      .from("ai_conversations")
      .select("id, business_id")
      .eq("id", body.conversationId)
      .maybeSingle();
    // RLS sudah membatasi ke milik pengguna; cek ekstra agar eksplisit
    if (convo && convo.business_id === business.id) {
      conversationId = convo.id;
    }
    // conversationId tidak valid → diabaikan (percakapan baru), bukan error
  }

  let isNewConversation = false;
  if (!conversationId) {
    const { data: created, error } = await supabase
      .from("ai_conversations")
      .insert({ business_id: business.id, title: message.slice(0, 60) })
      .select("id")
      .single();
    if (error || !created) {
      return NextResponse.json({ error: "Gagal memulai percakapan." }, { status: 500 });
    }
    conversationId = created.id;
    isNewConversation = true;
  }

  // ---------- riwayat ----------
  const { data: historyRows } = await supabase
    .from("ai_messages")
    .select("role, content, structured_data")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(14);

  const history: Array<{ role: "user" | "assistant"; content: string }> = (
    historyRows ?? []
  ).map((row) => {
    const data = row.structured_data as { reply?: string } | null;
    const content =
      row.role === "assistant" && data?.reply
        ? `[transaksi terkait]
Jawaban asisten sebelumnya: ${row.content}`
        : row.content;
    return { role: row.role as "user" | "assistant", content };
  });

  // ---------- simpan pesan pengguna ----------
  const { error: userMsgError } = await supabase.from("ai_messages").insert({
    conversation_id: conversationId,
    role: "user",
    content: message,
  });
  if (userMsgError) {
    return NextResponse.json({ error: "Gagal menyimpan pesan." }, { status: 500 });
  }

  // ---------- panggil LLM / simulasi ----------
  const result = await runAssistant(history, business.name);

  // Validasi hasil (LLM TIDAK dipercaya mentah) — untuk ditandai di reply
  const validated = result.parsed.transaction
    ? validateTransaction(result.parsed.transaction)
    : null;
  const safeTransaction = validated?.valid ? validated.data : null;
  const replyText =
    result.parsed.transaction && !validated?.valid
      ? `Data transaksinya belum lengkap: ${validated?.errors.join(" ")} — tolong tuliskan lebih rinci ya.`
      : result.parsed.reply;

  // ---------- simpan balasan assistant ----------
  const structured: Record<string, unknown> = {
    reply: replyText,
    action_type: safeTransaction ? "transaction_ready" : "none",
    simulation_mode: result.simulationMode,
  };
  if (safeTransaction) structured.transaction = safeTransaction;

  const { data: assistantMsg, error: assistantMsgError } = await supabase
    .from("ai_messages")
    .insert({
      conversation_id: conversationId,
      role: "assistant",
      content: replyText,
      structured_data: structured,
    })
    .select("id, created_at")
    .single();

  if (assistantMsgError || !assistantMsg) {
    return NextResponse.json({ error: "Gagal menyimpan balasan." }, { status: 500 });
  }

  const chatMessage: ChatMessage = {
    id: assistantMsg.id,
    role: "assistant",
    content: replyText,
    transaction: safeTransaction,
  };

  return NextResponse.json({
    reply: replyText,
    action_type: safeTransaction ? "transaction_ready" : "none",
    transaction: safeTransaction,
    aiMessageId: assistantMsg.id,
    conversationId,
    isNewConversation,
    simulationMode: result.simulationMode,
  });
}
