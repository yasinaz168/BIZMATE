"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { validateProduct } from "@/lib/products/validate";
import { logDbError } from "@/lib/server-log";

/**
 * SERVER ACTIONS — Product Management (Tahap P2).
 *
 * Pola mengikuti onboarding/pengaturan actions:
 * - Signature (prevState, formData) untuk useActionState.
 * - auth.getUser() (bukan getSession) — token divalidasi ke server Supabase.
 * - Pesan error untuk pengguna dalam Bahasa Indonesia & TANPA detail
 *   internal database (detail dicatat aman via logDbError).
 *
 * Keamanan:
 * - business_id TIDAK PERNAH diambil dari input browser — selalu dari
 *   lookup bisnis milik user yang terautentikasi.
 * - Setiap mutasi difilter eksplisit `.eq("business_id", ...)` di samping
 *   RLS (lapisan ganda).
 * - TIDAK ada operasi DELETE — pencabutan produk lewat setProductActiveAction
 *   (is_active = false), data historis transaksi tetap utuh.
 * - Tidak menyimpan transaksi dan tidak mengubah stok di tahap ini.
 */

export type ProductFormState = {
  error?: string;
  success?: string;
};

type ServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Hasil lookup bisnis — tiga kondisi dibedakan tegas:
 * - "found"      : query sukses & bisnis ditemukan
 * - "no_business": query sukses tetapi bisnis memang belum tersedia
 * - "db_error"   : query GAGAL — BUKAN berarti bisnis tidak ada
 */
type BusinessLookup =
  | { status: "found"; businessId: string }
  | { status: "no_business" }
  | { status: "db_error" };

/** Pesan kegagalan query bisnis — TANPA detail database */
const BUSINESS_DB_ERROR = "Gagal memuat data bisnis. Silakan coba lagi.";
/** Pesan ketika bisnis memang belum dimiliki pengguna */
const NO_BUSINESS_ERROR = "Profil bisnis belum ada. Lengkapi data bisnis terlebih dahulu.";

/**
 * Ambil id bisnis milik pengguna yang terautentikasi.
 * Inilah SATU-SATUNYA sumber business_id — tidak mempercayai input browser.
 *
 * Kegagalan query dibedakan dari kondisi "belum punya bisnis": error
 * dicatat via logDbError (detail aman di server) dan dikembalikan sebagai
 * status "db_error" agar action memberi pesan kegagalan database,
 * bukan menyesatkan "Profil bisnis belum ada".
 */
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
    // Kegagalan query database — jangan disamakan dengan "bisnis belum ada"
    logDbError(
      {
        route: "produk/actions",
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

/** Ambil field produk dari FormData untuk divalidasi (validasi = tanggung jawab validateProduct) */
function readProductFields(formData: FormData): unknown {
  return {
    name: formData.get("name"),
    category: formData.get("category"),
    selling_price: formData.get("selling_price"),
    unit_cost: formData.get("unit_cost"),
    stock: formData.get("stock"),
    unit: formData.get("unit"),
    is_active: formData.get("is_active"),
  };
}

/**
 * Tambah produk baru.
 * business_id berasal dari lookup server — field "business_id" di form
 * diabaikan sepenuhnya.
 */
export async function createProductAction(
  _prevState: ProductFormState | null,
  formData: FormData
): Promise<ProductFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Sesi berakhir. Silakan login ulang." };
  }

  const parsed = validateProduct(readProductFields(formData));
  if (!parsed.valid || !parsed.data) {
    return { error: parsed.errors.join(" ") };
  }

  const lookup = await resolveBusinessId(supabase, user.id);
  if (lookup.status === "db_error") {
    // Kegagalan query — jangan tampilkan sebagai "bisnis belum ada"
    return { error: BUSINESS_DB_ERROR };
  }
  if (lookup.status === "no_business") {
    return { error: NO_BUSINESS_ERROR };
  }
  const businessId = lookup.businessId;

  const product = parsed.data;
  const { error } = await supabase.from("products").insert({
    business_id: businessId, // dari lookup server — BUKAN dari form
    name: product.name,
    category: product.category,
    selling_price: product.selling_price,
    unit_cost: product.unit_cost,
    stock: product.stock,
    unit: product.unit,
    is_active: product.is_active,
  });

  if (error) {
    // Detail database dicatat aman di server — tidak ditampilkan ke pengguna
    logDbError({ route: "produk/actions", table: "products", op: "insert" }, error);
    return { error: "Gagal menyimpan produk. Silakan coba lagi." };
  }

  revalidatePath("/", "layout");
  revalidatePath("/produk");
  return { success: "Produk berhasil ditambahkan." };
}

/**
 * Ubah data produk (nama, kategori, harga jual, modal, stok, satuan).
 * Kepemilikan dijamin filter id + business_id (di samping RLS).
 * is_active TIDAK diubah di sini — khusus setProductActiveAction.
 */
export async function updateProductAction(
  _prevState: ProductFormState | null,
  formData: FormData
): Promise<ProductFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Sesi berakhir. Silakan login ulang." };
  }

  const productId = String(formData.get("product_id") ?? "").trim();
  if (productId.length === 0) {
    return { error: "Produk tidak ditemukan." };
  }

  const parsed = validateProduct(readProductFields(formData));
  if (!parsed.valid || !parsed.data) {
    return { error: parsed.errors.join(" ") };
  }

  const lookup = await resolveBusinessId(supabase, user.id);
  if (lookup.status === "db_error") {
    // Kegagalan query — jangan tampilkan sebagai "bisnis belum ada"
    return { error: BUSINESS_DB_ERROR };
  }
  if (lookup.status === "no_business") {
    return { error: NO_BUSINESS_ERROR };
  }
  const businessId = lookup.businessId;

  const product = parsed.data;
  // UPDATE berfilter id + business_id → 0 baris bila produk bukan milik
  // bisnis ini (atau tidak ada). Pesan disamakan agar tidak menjadi
  // oracle keberadaan produk milik bisnis lain.
  const { data: updated, error } = await supabase
    .from("products")
    .update({
      name: product.name,
      category: product.category,
      selling_price: product.selling_price,
      unit_cost: product.unit_cost,
      stock: product.stock,
      unit: product.unit,
      // is_active sengaja tidak disentuh di sini
    })
    .eq("id", productId)
    .eq("business_id", businessId)
    .select("id")
    .maybeSingle();

  if (error) {
    logDbError({ route: "produk/actions", table: "products", op: "update" }, error);
    return { error: "Gagal menyimpan perubahan produk. Silakan coba lagi." };
  }
  if (!updated) {
    return { error: "Produk tidak ditemukan." };
  }

  revalidatePath("/", "layout");
  revalidatePath("/produk");
  return { success: "Produk berhasil diperbarui." };
}

/**
 * Aktifkan/nonaktifkan produk (is_active) — TIDAK menghapus data.
 * Kepemilikan dijamin filter id + business_id (di samping RLS).
 */
export async function setProductActiveAction(
  productId: string,
  isActive: boolean
): Promise<ProductFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Sesi berakhir. Silakan login ulang." };
  }

  const id = typeof productId === "string" ? productId.trim() : "";
  if (id.length === 0) {
    return { error: "Produk tidak ditemukan." };
  }
  if (typeof isActive !== "boolean") {
    return { error: "Status produk tidak valid." };
  }

  const lookup = await resolveBusinessId(supabase, user.id);
  if (lookup.status === "db_error") {
    // Kegagalan query — jangan tampilkan sebagai "bisnis belum ada"
    return { error: BUSINESS_DB_ERROR };
  }
  if (lookup.status === "no_business") {
    return { error: NO_BUSINESS_ERROR };
  }
  const businessId = lookup.businessId;

  const { data: updated, error } = await supabase
    .from("products")
    .update({ is_active: isActive })
    .eq("id", id)
    .eq("business_id", businessId)
    .select("id")
    .maybeSingle();

  if (error) {
    logDbError(
      { route: "produk/actions", table: "products", op: "update", step: "status aktif" },
      error
    );
    return { error: "Gagal mengubah status produk. Silakan coba lagi." };
  }
  if (!updated) {
    return { error: "Produk tidak ditemukan." };
  }

  revalidatePath("/", "layout");
  revalidatePath("/produk");
  return {
    success: isActive ? "Produk diaktifkan." : "Produk dinonaktifkan.",
  };
}
