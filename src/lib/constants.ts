/** Daftar kategori bisnis — dipakai di onboarding & pengaturan. */
export const BusinessCategories = [
  "Makanan & Minuman",
  "Fashion & Pakaian",
  "Retail / Online Shop",
  "Kerajinan & Handmade",
  "Kecantikan & Perawatan",
  "Elektronik & Aksesoris",
  "Jasa Profesional",
  "Lainnya",
] as const;

/**
 * Daftar kategori PRODUK — saran untuk form produk (bukan kategori bisnis).
 * Kolom `products.category` bersifat free text, jadi daftar ini hanya
 * pilihan dropdown yang tetap boleh diisi manual oleh pengguna.
 */
export const ProductCategories = [
  "Makanan",
  "Minuman",
  "Fashion & Pakaian",
  "Kecantikan & Perawatan",
  "Elektronik & Aksesori",
  "Kerajinan & Handmade",
  "Bahan Baku",
  "Jasa",
  "Lainnya",
] as const;

/**
 * Daftar satuan produk — saran untuk form produk (`products.unit` free text).
 * Diselaraskan dengan satuan yang dikenali parser AI (mock-parser).
 */
export const ProductUnits = [
  "pcs",
  "buah",
  "unit",
  "butir",
  "gelas",
  "porsi",
  "pack",
  "kg",
  "gram",
  "liter",
  "ml",
  "botol",
  "lusin",
  "lembar",
  "meter",
  "pasang",
] as const;
