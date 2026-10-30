import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { validateTransaction } from "@/lib/ai/validate";
import { formatIDR } from "@/lib/format";

/**
 * POST /api/assistant/save
 *
 * SATU-SATUNYA pintu menuju tabel transactions dari AI Chat.
 * - Validasi ULANG seluruh data di server (preview browser tidak dipercaya).
 * - Requirement: action_type harus "transaction_ready" + data valid,
 *   artinya pengguna SUDAH melihat preview & menekan tombol Simpan.
 * - Total = Math.round(quantity × unit_price) — dihitung DI SERVER.
 * - Setelah tersimpan: revalidatePath agar dashboard langsung memakai
 *   data terbaru.
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
    transaction?: unknown;
  } | null;

  // ---------- validasi ulang di server ----------
  const validation = validateTransaction(body?.transaction);
  if (!validation.valid || !validation.data) {
    return NextResponse.json(
      {
        error: "Data transaksi belum valid. Periksa kembali form-nya.",
        errors: validation.errors,
      },
      { status: 400 }
    );
  }
  const tx = validation.data;

  // ---------- bisnis (RLS aktif) ----------
  const { data: business } = await supabase
    .from("businesses")
    .select("id")
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!business) {
    return NextResponse.json({ error: "Profil bisnis belum ada." }, { status: 409 });
  }

  // ---------- simpan ----------
  const { data: inserted, error } = await supabase
    .from("transactions")
    .insert({
      business_id: business.id,
      type: tx.type,
      title: tx.title,
      quantity: tx.quantity,
      unit_price: tx.unit_price,
      total: tx.total, // dihitung server, bukan dari browser
      transacted_at: tx.transacted_at_iso,
      payment_method: tx.payment_method ?? "cash", // default form; tampil jelas di preview
      source: "ai_chat",
      notes: tx.notes || null,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    return NextResponse.json({ error: "Gagal menyimpan transaksi ke database." }, { status: 500 });
  }

  // ---------- dashboard & halaman ikut memakai data terbaru ----------
  revalidatePath("/", "layout");

  return NextResponse.json({
    ok: true,
    transactionId: inserted.id,
    summary: `${tx.type === "income" ? "Pemasukan" : "Pengeluaran"} ${tx.title} ${formatIDR(tx.total)} tersimpan.`,
  });
}
