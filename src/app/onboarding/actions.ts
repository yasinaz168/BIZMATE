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

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ full_name: fullName, phone: phone || null })
    .eq("id", user.id);

  if (profileError) {
    return { error: "Gagal menyimpan profil. Coba lagi." };
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
    // Sudah punya bisnis (unique owner_id) → langsung ke dashboard
    if (businessError.code === "23505") {
      redirect("/dashboard");
    }
    return { error: "Gagal menyimpan bisnis. Coba lagi." };
  }

  redirect("/dashboard");
}
