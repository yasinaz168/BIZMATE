import type { TransactionType } from "@/types";

/**
 * =====================================================================
 * NORMALISASI KETERANGAN TRANSAKSI (R1.a) — murni, tanpa UI/DB.
 * =====================================================================
 * Tujuan: keterangan (title) singkat, natural, dan profesional dengan
 * pola "[Penjualan|Pembelian|Pembayaran|Pengeluaran] + objek".
 *
 * PRINSIP ANTI-FABRIKASI (paling penting):
 * - "core" (inti) HANYA boleh berisi kata-kata yang benar-benar disebut
 *   pengguna. Modul ini TIDAK PERNAH menambah objek/nominal/jumlah/
 *   metode baru — yang ditambahkan hanya prefiks KATEGORI generik
 *   (Penjualan/Pembelian/Pembayaran/Pengeluaran) dan pembersihan tata
 *   bahasa (kata ganti, kata penghubung menggantung, kata ganda).
 * - Tidak mengubah jenis (income/expense) — jenis datang dari argumen
 *   yang sudah tervalidasi.
 * - Input kosong → kembalikan "" (validator tetap menolak judul kosong;
 *   TIDAK menghasilkan judul palsu).
 * - Panjang maksimal 150 karakter, dipotong pada batas KATA — kontrak
 *   validator (maks 160) tetap terpenuhi.
 */

export const TITLE_MAX_CHARS = 150;

/** Kata penghubung/kata ganti yang menggantung di awal core. */
const LEADING_NOISE =
  /^(?:aku|saya|kami|kita|gue|gw|tadi|kemarin|barusan|hari ini|ya|ok|oke|bang|kak|bos|mas|mbak|dengan|untuk|buat|dari|yang|dan|pada|pakai|pake|sama|atau|lalu|terus|trus|kemudian)\b[\s,.:;-]*/i;

/** Kata penghubung/penunjuk yang menggantung di akhir core.
 *  CATATAN (audit R2-QTY): WAJIB ada batas kata/separator sebelum
 *  konektor — pola lama tanpa guard memotong "yang" dari "loyang"
 *  (hasil "lo"), "ini" dari "mini", dst. */
const TRAILING_NOISE =
  /(?:^|[\s,.:;-])(?:dengan|untuk|buat|dari|yang|dan|pada|pakai|pake|sama|atau|itu|ini|aja|dong|ya|kok|sih|deh)[\s,.:;-]*$/i;

/** Ekor frasa KATEGORI yang menggantung ("… dengan pembayaran") — bukan objek. */
const TRAILING_CATEGORY_META =
  /\s+(?:dengan\s+)?(?:pembayaran|penjualan|pembelian|pemasukan|pengeluaran)$/i;

/** Frasa "per <satuan>" ("per loyang", "per buah") → bukan objek judul. */
const PER_UNIT_PHRASE = /\bper\s+[\p{L}]+/giu;

/** Aktivitas → membantu menentukan kategori (bayar vs beli vs jual). */
const PAYMENT_VERBS = /^(?:membayar|melunasi|bayar(?:kan|in)?|lunas(?:kan)?|setor(?:kan)?)\b/i;
const PURCHASE_VERBS = /^(?:membeli|memesan|berbelanja|beli|pesan|order|belanja|borong)\b/i;
const SALE_VERBS = /^(?:menjual|menyewakan|terjual|jual|sewakan|laku)\b/i;

/** Kewajiban/tagihan eksplisit → kategori "Pembayaran". */
const PAYMENT_CUES =
  /\b(?:tagihan|token|listrik|pln|air|pdam|pulsa|internet|wifi|sewa|kontrakan|gaji|upah|iuran|pajak|pbb|angsuran|cicilan|bpjs|asuransi|premi|langganan|rekening|telepon|asuransi)\b/i;

/** Konteks jelas pembelian barang → kategori "Pembelian". */
const PURCHASE_CUES =
  /\b(?:pembelian|belanjaan|barang|bahan|bahan-bahan|stok|persediaan|material)\b/i;

/** Kata kategori yang sudah ada di awal core (cegah prefiks ganda). */
const EXISTING_PREFIX = /^(?:penjualan|pembelian|pembayaran|pengeluaran)\b/i;

/**
 * Kata kerja redundan di EKOR judul (hotfix R1.1): "… dengan membayar"
 * mengulang makna prefiks "Pembayaran". Hanya dibuang bila:
 * - berada persis di akhir (opsional didahului konektor "dengan/dsb."),
 * - cocok KATEGORI dengan prefiks judul (payment/purchase/sale),
 * - berupa kata utuh (whole-word) — nama produk seperti "belimbing"
 *   tidak akan tersentuh.
 */
const REDUNDANT_VERB_TAIL = {
  payment: /\s+(?:(?:dengan|secara|pakai|pake|untuk|buat|cara)\s+)?(?:membayar|bayar)$/i,
  purchase: /\s+(?:(?:dengan|secara|pakai|pake|untuk|buat|cara)\s+)?(?:membeli|beli)$/i,
  sale: /\s+(?:(?:dengan|secara|pakai|pake|untuk|buat|cara)\s+)?(?:menjual|jual)$/i,
} as const;

type VerbCategory = keyof typeof REDUNDANT_VERB_TAIL;

/** Kategori dari prefiks yang terlanjur ada di core ("Penjualan …" dsb.). */
function categoryFromPrefix(text: string): VerbCategory | null {
  if (/^penjualan\b/i.test(text)) return "sale";
  if (/^pembelian\b/i.test(text)) return "purchase";
  if (/^pembayaran\b/i.test(text)) return "payment";
  return null; // "Pengeluaran" = netral → tidak menyentuh kata kerja
}

/** Buang ekor kata kerja yang redundan dengan prefiks kategori. */
function stripRedundantVerbTail(text: string, category: VerbCategory): string {
  return text.replace(REDUNDANT_VERB_TAIL[category], "").trim();
}

/** Nominal satuan yang mungkin tersisa (tidak boleh jadi judul). */
const MONEY_SUFFIX_WORD = /\b(?:rb|ribu|juta|jt|k)\b/gi;
/** Nominal lengkap "50rb", "90 ribu", "2juta" — dibuang lebih dulu. */
const MONEY_WITH_SUFFIX = /\b\d+(?:[.,]\d+)?\s*(?:rb|ribu|juta|jt|k)\b/gi;
/**
 * Angka + satuan ("10 gelas", "3 kg") dan angka polos → bukan inti judul.
 * CATATAN: tanpa \b di akhir — "50rb" pernah lolos karena transisi
 * digit→huruf BUKAN word boundary.
 */
const QTY_WITH_UNIT =
  /\b\d+(?:[.,]\d+)?\s*(?:pcs|pieces|buah|unit|butir|gelas|porsi|mangkuk|cup|liter|ltr|ml|kg|gr|pack|box|pax|set|pasang|lembar|ekor|orang)?/gi;
const VERB_HEADS = /^(?:membayar|melunasi|bayar(?:kan|in)?|lunas(?:kan)?|setor(?:kan)?|membeli|memesan|berbelanja|beli|pesan|order|belanja|borong|menjual|menyewakan|terjual|jual|sewakan|laku)\b[\s,.:;-]*/i;

/**
 * Bersihkan core: spasi, kata penghubung menggantung, kata ganda
 * berdampingan (mis. "bahan-bahan" / "bahan bahan" → "bahan"), sisa
 * nominal/kuantitas.
 */
export function cleanTransactionCore(core: string): string {
  let t = core.replace(/\s+/g, " ").trim();

  // 1) reduplikasi bersebelahan (dengan/tanpa tanda hubung) → satu kata
  t = t.replace(/\b([\p{L}]+)-\1\b/giu, "$1");
  t = t.replace(/\b([\p{L}]+)\s+\1\b/giu, "$1");

  // 2) nominal & kuantitas tidak boleh menjadi bagian judul
  t = t.replace(MONEY_WITH_SUFFIX, " "); // "50rb", "90 ribu" utuh (sebelum angka)
  t = t.replace(QTY_WITH_UNIT, " ");
  t = t.replace(MONEY_SUFFIX_WORD, " ");
  t = t.replace(/\b\d+(?:[.,]\d+)?\b/g, " ");

  // 2b) frasa "per <satuan>" ("per loyang", "per buah") bukan objek judul
  t = t.replace(PER_UNIT_PHRASE, " ");

  // 3) buang kata penghubung/kata ganti menggantung di awal & akhir,
  //    termasuk ekor frasa kategori ("… dengan pembayaran")
  for (let i = 0; i < 8; i += 1) {
    const before = t;
    t = t.replace(LEADING_NOISE, "").replace(TRAILING_NOISE, "");
    t = t.replace(TRAILING_CATEGORY_META, "");
    if (t === before) break;
  }

  // 4) sisa tanda baca di awal/akhir hasil pengupasan (mis. " ." setelah
  //    nominal dibuang) tidak boleh menjadi bagian judul
  t = t.replace(/^[\s,.:;!?-]+/, "").replace(/[\s,.:;!?-]+$/, "");

  return t.replace(/\s+/g, " ").trim();
}

/** Potong maksimal TITLE_MAX_CHARS pada batas KATA terdekat. */
function truncateAtWord(text: string): string {
  if (text.length <= TITLE_MAX_CHARS) return text;
  const cut = text.slice(0, TITLE_MAX_CHARS);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > TITLE_MAX_CHARS / 2 ? cut.slice(0, lastSpace) : cut).trim();
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function stripVerbHead(text: string): string {
  return text.replace(VERB_HEADS, "").trim();
}

/**
 * Normalisasi keterangan transaksi (R1.a).
 *
 * @param type jenis transaksi yang SUDAH tervalidasi (income/expense)
 * @param core inti objek transaksi dari pesan pengguna (boleh masih
 *             mengandung kata kerja "beli/bayar/jual" — dipakai untuk
 *             menentukan kategori, lalu dibuang dari judul).
 * @returns judul final (maks 150 karakter, batas kata); "" bila core
 *          kosong — pemanggil/validator yang memutuskan, tanpa judul palsu.
 */
export function normalizeTransactionTitle(
  type: TransactionType,
  core: string
): string {
  const cleaned = cleanTransactionCore(core);
  if (!cleaned) return "";

  // Core SUDAH memuat kata kategori → jangan tambah prefiks (anti ganda).
  // Hotfix R1.1: ekor kata kerja redundan tetap dibuang sesuai kategori.
  const prefixedCategory = categoryFromPrefix(cleaned);
  if (EXISTING_PREFIX.test(cleaned)) {
    const finalText = prefixedCategory
      ? stripRedundantVerbTail(cleaned, prefixedCategory)
      : cleaned;
    return truncateAtWord(capitalize(finalText));
  }

  if (type === "income") {
    const object = stripRedundantVerbTail(stripVerbHead(cleaned), "sale");
    return truncateAtWord(capitalize(`Penjualan ${object}`.trim()));
  }

  // ---- expense: Pembayaran (kewajiban) / Pembelian (barang) / netral ----
  const isPayment = PAYMENT_VERBS.test(cleaned) || PAYMENT_CUES.test(cleaned);
  const isPurchase = PURCHASE_VERBS.test(cleaned) || PURCHASE_CUES.test(cleaned);

  if (isPayment) {
    let object = stripVerbHead(cleaned);
    // "tagihan/iuran/rekening" di depan redundan dengan prefiks Pembayaran
    object = object.replace(/^(?:tagihan|iuran|rekening)\b[\s,.:;-]*/i, "").trim();
    object = stripRedundantVerbTail(object, "payment");
    return truncateAtWord(capitalize(`Pembayaran ${object}`.trim()));
  }

  if (isPurchase) {
    const object = stripRedundantVerbTail(stripVerbHead(cleaned), "purchase");
    return truncateAtWord(capitalize(`Pembelian ${object}`.trim()));
  }

  // Tidak jelas pembelian/kewajiban → netral, tanpa mengarang kategori
  return truncateAtWord(capitalize(`Pengeluaran ${cleaned}`.trim()));
}
