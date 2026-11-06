"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logDbError } from "@/lib/server-log";

/**
 * =====================================================================
 * SERVER ACTION — Hapus Percakapan (P4.2).
 * =====================================================================
 * Alur (pola produk/actions.ts + P5.4.5 penting keamanan):
 * 1. supabase.auth.getUser() — sesi divalidasi ke Supabase.
 * 2. resolveBusiness: businesses.owner_id = user.id — business_id TIDAK
 *    PERNAH berasal dari browser.
 * 3. Guard id: conversation wajib UUID — bukan UUID → "not_found" tanpa
 *    menyentuh DB sama sekali (tidak bocor, tidak error aneh).
 * 4. DELETE baris `ai_conversations` dengan
 *    `.eq("business_id", businessId).eq("id", id)` (isolasi & ownership)
 *    + `.select("id")` untuk MEMBEDAKAN terhapus vs tidak ditemukan.
 *    Seluruh `ai_messages` percakapan ikut terhapus lewat FK
 *    ON DELETE CASCADE (00001:165) — bukan operasi terpisah.
 * 5. TRANSAKSI AMAN: `transactions`/`transaction_items`/`products` tidak
 *    pernah disentuh (schema 00001: tidak ada FK ke tabel AI maupun
 *    sebaliknya). Tidak ada service_role.
 *
 * Tidak ada penghapusan otomatis berbasis waktu. Action ini dipanggil
 * hanya setelah konfirmasi eksplisit pengguna (see conversation-list).
 */

export type ConversationDeleteResult =
  | { status: "deleted"; id: string }
  | { status: "not_found"; id: string }
  | { status: "error"; message: string };

type ServerClient = Awaited<ReturnType<typeof createClient>>;

const NO_SESSION_ERROR = "Sesi berakhir. Silakan login ulang.";
const NO_BUSINESS_ERROR = "Profil bisnis belum ada. Lengkapi data bisnis terlebih dahulu.";
const DELETE_DB_ERROR = "Gagal menghapus percakapan. Silakan coba lagi.";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type BusinessLookup =
  | { status: "found"; businessId: string }
  | { status: "no_business" }
  | { status: "db_error" };

async function resolveBusinessId(
  supabase: ServerClient,
  userId: string
): Promise<BusinessLookup> {
  const { data: business, error } = await supabase
    .from("businesses")
    .select("id")
    .eq("owner_id", userId)
    .maybeSingle();

  if (error) {
    logDbError(
      {
        route: "assistant/actions",
        table: "businesses",
        op: "select",
        step: "lookup bisnis",
      },
      error
    );
    return { status: "db_error" };
  }

  if (!business) {
    return { status: "no_business" };
  }
  return { status: "found", businessId: business.id };
}

/**
 * Hapus percakapan milik bisnis yang sedang login.
 * - business_id dari SERVER, conversation id dari argumen diverifikasi
 *   kepemilikannya lewat .eq("business_id") + .eq("id") sebelum delete.
 * - Baris ditemukan  → status "deleted" + revalidate /assistant.
 * - Baris tidak ada  → status "not_found" (percakapan sudah tidak ada
 *   ATAU bukan milik bisnis ini — respons disengaja sama, tanpa bocor);
 *   pesan AI-nya ikut hilang dari list, tanpa error membingungkan.
 * - Seluruh pesan (ai_messages) terhapus otomatis via FK cascade.
 */
export async function deleteConversationAction(
  conversationId: string
): Promise<ConversationDeleteResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { status: "error", message: NO_SESSION_ERROR };
  }

  // Guard: id tidak valid tidak perlu menyentuh database sama sekali —
  // ditempatkan SEBELUM lookup bisnis agar sampah input tidak menimbulkan
  // query/error tercetak di log.
  if (!UUID_RE.test(conversationId.trim())) {
    return { status: "not_found", id: conversationId.trim() };
  }

  const lookup = await resolveBusinessId(supabase, user.id);
  if (lookup.status === "db_error") {
    return {
      status: "error",
      message: "Gagal memuat data bisnis. Silakan coba lagi.",
    };
  }
  if (lookup.status === "no_business") {
    return { status: "error", message: NO_BUSINESS_ERROR };
  }

  const { data: deleted, error: deleteError } = await supabase
    .from("ai_conversations")
    .delete()
    .eq("business_id", lookup.businessId) // isolasi bisnis — WAJIB
    .eq("id", conversationId.trim())
    .select("id")
    .maybeSingle();

  if (deleteError) {
    logDbError(
      {
        route: "assistant/actions",
        table: "ai_conversations",
        op: "delete",
        step: "hapus percakapan",
      },
      deleteError
    );
    return { status: "error", message: DELETE_DB_ERROR };
  }

  if (!deleted) {
    // Tidak ditemukan / bukan milik bisnis ini → sama-sama "tidak ada",
    // tanpa membocorkan keberadaan percakapan bisnis lain.
    return { status: "not_found", id: conversationId.trim() };
  }

  revalidatePath("/assistant"); // daftar & percakapan aktif ikut segar

  return { status: "deleted", id: String((deleted as Record<string, unknown>).id ?? "") };
}
