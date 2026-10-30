"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type SettingsFormState = {
  error?: string;
  success?: string;
};

/**
 * Simpan perubahan profil bisnis.
 * RLS menjamin hanya baris milik auth.uid() yang bisa ter-update.
 */
export async function updateBusinessAction(
  _prevState: SettingsFormState | null,
  formData: FormData
): Promise<SettingsFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Sesi berakhir. Silakan login ulang." };
  }

  const name = String(formData.get("name") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const productType = String(formData.get("product_type") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();

  if (name.length < 2 || name.length > 120) {
    return { error: "Nama bisnis wajib di isi (2–120 karakter)." };
  }
  if (category.length === 0) {
    return { error: "Pilih kategori bisnis." };
  }

  // Update nama pemilik di profile (memudahkan greeting & identitas)
  const { error: profileError } = await supabase
    .from("profiles")
    .update({ phone: phone || null })
    .eq("id", user.id);
  if (profileError) {
    return { error: "Gagal menyimpan profil pemilik." };
  }

  const { error: businessError } = await supabase
    .from("businesses")
    .update({
      name,
      category,
      description: description || null,
      product_type: productType || null,
      phone: phone || null,
    })
    .eq("owner_id", user.id);

  if (businessError) {
    return { error: "Gagal menyimpan profil bisnis." };
  }

  // Refresh header, sidebar, dan halaman ini dengan data baru
  revalidatePath("/", "layout");
  revalidatePath("/pengaturan");

  return { success: "Profil bisnis berhasil disimpan." };
}
