import type { AiTransaction, ChatTransactionResponse, PaymentMethod, TransactionType } from "./types";
import { jakartaDaysAgoN, jakartaTodayISO } from "@/lib/time";

/**
 * MODE SIMULASI — parser rule-based Bahasa Indonesia.
 *
 * DIPAKAI SAAT LLM_API_KEY belum diisi di .env.local. Ini BUKAN AI
 * sungguhan: pencocokan pola sederhana yang deterministik. Semua
 * hasil tetap melewati validator + konfirmasi pengguna seperti alur
 * LLM asli.
 *
 * Prinsip dijaga (sama dengan LLM):
 * - TIDAK MENEBAK. Nominal/jumlah/tanggal yang tidak terdeteksi
 *   tidak dikarang — asisten bertanya balik.
 * - "total Rp X" (tanpa jumlah) → 1 item dengan unit_price = total.
 * - Hasil selalu ditampilkan sebagai PREVIEW yang bisa diedit.
 */

const INCOME_WORDS = [
  "jual", "terjual", "laku", "penjualan", "omzet", "pendapatan",
];
const EXPENSE_WORDS = [
  "beli", "bayar", "biaya", "belanja", "keluar", "modal",
  "setor", "sewa", "langganan", "gaji",
];

const PAYMENT_PATTERNS: Array<{ re: RegExp; method: PaymentMethod }> = [
  { re: /\b(cash|tunai|uang pas)\b/i, method: "cash" },
  { re: /\b(transfer|tf)\b/i, method: "transfer" },
  { re: /\b(qris|qr)\b/i, method: "qris" },
  { re: /\b(ovo|gopay|go pay|dana|shopeepay|linkaja|e-?wallet)\b/i, method: "ewallet" },
];

const UNIT_WORDS = "pcs|buah|unit|butir|gelas|porsi|mangkuk|cup|liter|kg|pack";

function classifyType(text: string): TransactionType | null {
  const lower = text.toLowerCase();
  const hasIncome = INCOME_WORDS.some((w) => lower.includes(w));
  const hasExpense = EXPENSE_WORDS.some((w) => lower.includes(w));
  if (hasIncome && !hasExpense) return "income";
  if (hasExpense && !hasIncome) return "expense";
  return null;
}

function detectPayment(text: string): PaymentMethod | null {
  for (const { re, method } of PAYMENT_PATTERNS) {
    if (re.test(text)) return method;
  }
  return null;
}

/** "Rp75.000" → 75000; "75,5" → 75,5 (desimal koma, bukan ribuan) */
function normalizeMoney(s: string): number | null {
  if (/\d,\d/.test(s) && !/\d\.\d{3}/.test(s)) {
    const v = parseFloat(s.replace(",", "."));
    return Number.isFinite(v) ? v : null;
  }
  const v = parseInt(s.replace(/\./g, ""), 10);
  return Number.isFinite(v) ? v : null;
}

/**
 * Ambil nominal uang dari kalimat, TANPA dobel hitung.
 * Pola: "rp75.000", "75rb/ribu/k", "75,5", "1.200.000".
 * Mengembalikan juga posisi substring yang telah dicocokkan agar
 * deteksi quantity tidak salah membaca angka nominal sebagai jumlah.
 */
interface MoneyHit {
  value: number;
  index: number;
  length: number;
}

function detectMoney(text: string): MoneyHit[] {
  const hits: MoneyHit[] = [];
  const push = (m: RegExpExecArray | RegExpMatchArray) => {
    const v = normalizeMoney((m[1] ?? "").trim());
    if (v !== null && m.index !== undefined) {
      hits.push({ value: v, index: m.index, length: m[0].length });
    }
  };

  const withRp = /\brp\.?\s?(\d+(?:[.,]\d+)?(?:\s?(?:rb|ribu|juta|jt|k))?|[.,]\d{3})\b/gi;
  for (const m of text.matchAll(withRp)) push(m);

  const withSuffix = /\b(\d+(?:[.,]\d+)?)\s?(rb|ribu|juta|jt|k)\b/gi;
  for (const m of text.matchAll(withSuffix)) push(m);

  if (hits.length === 0) {
    // nominal tanpa awalan "Rp": hanya bentuk ribuan titik eksplisit
    const plain = /\b(\d{1,3}(?:\.\d{3})+)\b/g;
    for (const m of text.matchAll(plain)) push(m);
  }

  // dedupe nilai identik (Rp75.000 dicocokkan 1x saja)
  const seen = new Map<number, MoneyHit>();
  for (const h of hits) if (!seen.has(h.value)) seen.set(h.value, h);
  return [...seen.values()];
}

/** Versi teks tanpa nominal uang — agar "75" di "Rp75.000" tidak dibaca sbg jumlah */
function stripMoney(text: string): string {
  const hits = [...detectMoney(text)].sort((a, b) => b.index - a.index);
  let out = text;
  for (const h of hits) {
    out = out.slice(0, h.index) + " " + out.slice(h.index + h.length);
  }
  return out;
}

/** Tanggal relatif/eksplisit → "YYYY-MM-DD" (kalender Jakarta); null = tidak disebut */
function detectDate(text: string): string | null {
  const lower = text.toLowerCase();
  if (/\bkemarin\b/.test(lower)) return jakartaDaysAgoN(1);
  if (/\b(hari ini|tadi|barusan)\b/.test(lower)) return jakartaTodayISO();
  const iso = lower.match(/(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const dayMatch = lower.match(/(?:tgl|tanggal)\s*(\d{1,2})\b/);
  if (dayMatch) {
    const day = Number(dayMatch[1]);
    if (day >= 1 && day <= 31) {
      const today = jakartaTodayISO();
      const candidate = `${today.slice(0, 7)}-${String(day).padStart(2, "0")}`;
      return candidate <= today ? candidate : null; // masa depan tidak dipilih
    }
  }
  return null;
}

/** Jumlah unit: "3 kaos", "lima gelas", "10pcs" → number; null = tidak disebut */
function detectQuantity(textWithoutMoney: string): number | null {
  const m = textWithoutMoney.match(new RegExp(`\\b(\\d{1,3})\\s*(?:${UNIT_WORDS})?\\b`));
  if (m) {
    const n = Number(m[1]);
    return n > 0 && n <= 999 ? n : null;
  }
  const words: Array<[RegExp, number]> = [
    [/\bsatu\b/, 1], [/\bdua\b/, 2], [/\btiga\b/, 3], [/\bempat\b/, 4],
    [/\blima\b/, 5], [/\benam\b/, 6], [/\btujuh\b/, 7], [/\bdelapan\b/, 8],
    [/\bsembilan\b/, 9], [/\bsepuluh\b/, 10],
  ];
  for (const [re, n] of words) if (re.test(textWithoutMoney)) return n;
  return null;
}

/** Sisa teks dibersihkan jadi judul item; bila kosong → fallback berlabel edit */
function deriveTitle(text: string, type: TransactionType): string {
  let t = text.trim();
  t = t.replace(/\b(hari ini|kemarin|tadi|barusan)\b/gi, " ");
  t = t.replace(/^(ya|ok|oke|bang|kak|bos)[\s,.]*/i, "");
  t = t.replace(/^(saya|aku|kami)\s+/i, "");
  // frasa harga dulu
  t = t.replace(
    /\b(?:seharga|per|@|harga)\s*(?:rp\.?\s?)?\d+(?:[.,]\d+)?\s*(rb|ribu|juta|jt|k)?(?:\s*(?:pieces|buah|unit))?/gi,
    " "
  );
  // preposisi & kata kerja
  t = t.replace(
    /\b(menjulkan?|menjual|jual|terjual|membeli|beli|membayar|bayar|dari|untuk)\b/gi,
    " "
  );
  t = t.replace(/\b(per|seharga|harga)\b/gi, " ");
  // angka & satuan sisa
  t = t.replace(new RegExp(`\\b\\d{1,3}\\s*(?:${UNIT_WORDS})?\\b`, "gi"), " ");
  t = t.replace(/\b(cash|tunai|transfer|\btf\b|qris|gopay|dana|ovo|shopeepay)\b/gi, " ");
  t = t.replace(/\b(total|keseluruhan)\b/gi, " ");
  t = t.replace(/[\d.,]+/g, " ");
  t = t.replace(/\s{2,}/g, " ").trim();
  // satuan buntut yang melekat pada kuantitas, bukan nama produk
  t = t.replace(new RegExp(`\\s+(${UNIT_WORDS})[\\s.]*$`, "gi"), "");
  t = t.replace(/[.,;:-]+$/, "").trim();

  if (!t) {
    return type === "income" ? "Penjualan (edit judul ini)" : "Pengeluaran (edit judul ini)";
  }
  // Kapital di awal kata agar rapi
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Parser utama Mode Simulasi */
export function parseSimulation(text: string): ChatTransactionResponse {
  const type = classifyType(text);
  if (!type) {
    return {
      reply:
        "Maaf, aku belum menangkap maksudnya. Ceritakan pemasukan ATAU pengeluaran, misalnya:" +
        ' "Saya menjual 3 kaos @ Rp75.000" atau "Saya beli kopi 2 kg Rp35.000".',
      action_type: "none",
      transaction: null,
    };
  }

  const payment = detectPayment(text);
  const date = detectDate(text);
  const money = detectMoney(text);
  const stripped = stripMoney(text);
  const qty = detectQuantity(stripped);
  const mentionsTotal = /\btotal\b/i.test(text);
  const mentionsPerUnit = /(\bper\b|@|\bseharga\b)/i.test(text);

  const missingMoney = money.length === 0;
  if (missingMoney) {
    return {
      reply:
        `Aku mencatat ini sebagai ${type === "income" ? "pemasukan" : "pengeluaran"}. ` +
        'Berapa nilainya? Tuliskan harganya, misalnya "Rp75.000" atau "75rb".',
      action_type: "none",
      transaction: null,
    };
  }

  // 3+ nominal, atau 2 nominal tanpa penjelas "per"/"total" → jangan ditebak
  if (money.length > 2 || (money.length === 2 && !mentionsTotal && !mentionsPerUnit)) {
    return {
      reply:
        "Ada beberapa nominal di pesanmu dan aku tidak mau menebak. Tulis jelas, misalnya:" +
        ' "3 kaos per buah Rp75.000" atau "total Rp225.000".',
      action_type: "none",
      transaction: null,
    };
  }

  // 1 nominal tanpa jumlah & bukan "total" → bisa unit price ATAU total
  if (!qty && !mentionsTotal && !mentionsPerUnit) {
    return {
      reply:
        `Aku menemukan nominal Rp${Math.round(money[0].value).toLocaleString("id-ID")}. ` +
        "Itu harga per buah berapa buah, atau total keseluruhan? Contoh jawaban:" +
        ' "3 buah, per buah Rp75.000" atau "total Rp75.000".',
      action_type: "none",
      transaction: null,
    };
  }

  // Interpretasi yang tersisa:
  //   qty + 1 nominal       → harga per satuan
  //   "total X" / "per X"   → 1 item, unit_price = X
  const amount = Math.max(...money.map((m) => m.value));
  const quantity = qty ?? 1;

  const transaction: AiTransaction = {
    type,
    title: deriveTitle(text, type),
    quantity,
    unit_price: amount,
    payment_method: payment,
    transacted_at: date,
    notes: "",
  };

  const totalPreview = Math.round(quantity * amount);
  const missingBits: string[] = [];
  if (!payment) missingBits.push("metode bayar");
  if (!date) missingBits.push("tanggal (dikosongkan = hari ini)");

  const reply =
    `${type === "income" ? "Pemasukan" : "Pengeluaran"} dikenali: ${transaction.title}, ` +
    `${quantity} × Rp${amount.toLocaleString("id-ID")} = Rp${totalPreview.toLocaleString("id-ID")}` +
    (qty === null ? " (kuantitasmu aku isi 1 karena tidak disebut — silakan edit)." : ".") +
    (missingBits.length ? ` Lengkapi ${missingBits.join(" dan ")} di form sebelum disimpan.` : " Cek detailnya, lalu tekan Simpan bila sudah sesuai.");

  return {
    reply,
    action_type: "transaction_ready",
    transaction,
  };
}
