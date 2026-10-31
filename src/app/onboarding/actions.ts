"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type OnboardingFormState = {
  error?: string;
};

/**
 * Simpan onboarding:
 * 1. Update nama pemilik di profil.
 * 2. Buat business profile (1 pengguna = 1 bisnis di MVP).
 * RLS Supabase menjamin baris yang dibuat milik pengguna ini saja.
 */
export async function saveBusinessAction(
  _prevState: OnboardingFormState | null,
  formData: FormData
): Promise<OnboardingFormState> {
  const fullName = String(formData.get("full_name") ?? "").trim();
  const businessName = String(formData.get("business_name") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const productType = String(formData.get("product_type") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();

  if (fullName.length < 2) {
    return { error: "Nama pemilik minimal 2 karakter." };
  }
  if (businessName.length < 2 || businessName.length > 120) {
    return { error: "Nama bisnis wajib di isi (2–120 karakter)." };
  }
  if (category.length === 0) {
    return { error: "Pilih kategori bisnis." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: updatedProfile, error: profileError } = await supabase
    .from("profiles")
    .update({ full_name: fullName, phone: phone || null })
    .eq("id", user.id)
    .select("id");

  if (profileError) {
    // Diagnosis: catat error asli di log server — TIDAK ditampilkan ke pengguna
    console.error("[onboarding] Gagal UPDATE profiles:", {
      code: profileError.code,
      message: profileError.message,
      details: profileError.details,
      hint: profileError.hint,
      userId: user.id,
    });
    return { error: "Gagal menyimpan profil. Coba lagi." };
  }

  // UPDATE tanpa error pun bisa berakhir 0 baris (mis. baris profil belum pernah
  // terbuat — akun lama sebelum trigger handle_new_user). Deteksi di sini agar
  // tidak gagal membingungkan di langkah insert bisnis (FK owner_id).
  const updatedCount = Array.isArray(updatedProfile) ? updatedProfile.length : 0;
  if (updatedCount === 0) {
    console.error("[onboarding] UPDATE profiles tidak mengubah baris apa pun:", {
      userId: user.id,
    });
    return {
      error:
        "Profil akun belum bisa diperbarui. Silakan keluar lalu masuk kembali, lalu ulangi proses ini.",
    };
  }

  const { error: businessError } = await supabase.from("businesses").insert({
    owner_id: user.id,
    name: businessName,
    category,
    description: description || null,
    product_type: productType || null,
    phone: phone || null,
  });

  if (businessError) {
    // Diagnosis: catat error asli di log server — TIDAK ditampilkan ke pengguna
    console.error("[onboarding] Gagal INSERT businesses:", {
      code: businessError.code,
      message: businessError.message,
      details: businessError.details,
      hint: businessError.hint,
      userId: user.id,
    });
    // Sudah punya bisnis (unique owner_id) → langsung ke dashboard
    if (businessError.code === "23505") {
      redirect("/dashboard");
    }
    return { error: "Gagal menyimpan bisnis. Coba lagi." };
  }

  redirect("/dashboard");
}
