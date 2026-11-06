import type { AiTransaction, ChatTransactionResponse, PaymentMethod, TransactionType } from "./types";
import { normalizeTransactionTitle } from "@/lib/transactions/title";
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
  "pemasukan", "masuk", "laba", "untung",
];
const EXPENSE_WORDS = [
  "beli", "bayar", "biaya", "belanja", "pengeluaran", "keluar",
  "modal", "setor", "sewa", "langganan", "gaji",
];

function escapeRegex(word: string): string {
  return word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Cocokkan AKAR kata di AKHIR kata berimbuhan (R2.a):
 * "menjual"/"terjual" → "jual"; "membayar"/"dibayar" → "bayar";
 * "membeli" → "beli". TANPA \b di depan agar imbuhan depan diterima,
 * TETAPI "pembayaran" TIDAK memicu "bayar" (tidak berakhiran "bayar")
 * — sumber konflik income/expense yang membuat classifyType null.
 * "belimbing" aman (tidak berakhiran "beli").
 */
function hasRootWord(text: string, word: string): boolean {
  return new RegExp(`${escapeRegex(word)}\\b`, "i").test(text);
}

/** Kecocokan kata UTUH (tanpa imbuhan) — dipakai tie-break. */
function hasExactWord(text: string, word: string): boolean {
  return new RegExp(`\\b${escapeRegex(word)}\\b`, "i").test(text);
}

function classifyType(text: string): TransactionType | null {
  const lower = text.toLowerCase();
  const incomeRoot = INCOME_WORDS.some((w) => hasRootWord(lower, w));
  const expenseRoot = EXPENSE_WORDS.some((w) => hasRootWord(lower, w));
  if (incomeRoot && !expenseRoot) return "income";
  if (expenseRoot && !incomeRoot) return "expense";
  if (incomeRoot && expenseRoot) {
    // Tie-break aman (R2.a): kata UTUH lebih kuat daripada turunan
    // berimbuhan; bila benar-benar seimbang → JANGAN berspekulasi.
    const incomeExact = INCOME_WORDS.some((w) => hasExactWord(lower, w));
    const expenseExact = EXPENSE_WORDS.some((w) => hasExactWord(lower, w));
    if (incomeExact && !expenseExact) return "income";
    if (expenseExact && !incomeExact) return "expense";
    return null;
  }
  return null;
}
const PAYMENT_PATTERNS: Array<{ re: RegExp; method: PaymentMethod }> = [
  { re: /\b(cash|tunai|uang pas)\b/i, method: "cash" },
  { re: /\b(transfer|tf)\b/i, method: "transfer" },
  { re: /\b(qris|qr)\b/i, method: "qris" },
  { re: /\b(ovo|gopay|go pay|dana|shopeepay|linkaja|e-?wallet)\b/i, method: "ewallet" },
];

const UNIT_WORDS = "pcs|buah|unit|butir|gelas|porsi|mangkuk|cup|liter|kg|pack";

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

/**
 * Pengali sufiks nominal (P3-R1): rb/ribu/k ×1.000; juta/jt ×1.000.000.
 * Regex dites pada TULISAN MATCH (bukan grup) — tidak memakai \b di
 * depan karena sufiks mepet dengan digit ("30rb"/"2juta").
 */
const SUFFIX_MULTIPLIER: Array<[RegExp, number]> = [
  [/juta|jt\b/i, 1_000_000],
  [/(?:rb|ribu|k)\b/i, 1_000],
];

function multiplierFor(rawMatch: string): number {
  for (const [re, multi] of SUFFIX_MULTIPLIER) if (re.test(rawMatch)) return multi;
  return 1;
}

function detectMoney(text: string): MoneyHit[] {
  const hits: MoneyHit[] = [];
  const push = (m: RegExpExecArray | RegExpMatchArray) => {
    // pola fallback tanpa capture group → nilai = match utuh
    const base = normalizeMoney((m[1] ?? m[0] ?? "").trim());
    if (base === null || m.index === undefined) return;
    // R1: pengali sufiks diterapkan pada hasil match utuh (mis. "30rb" →
    // 30.000; "2juta" → 2.000.000). Format yang sudah benar (Rp75.000,
    // 1.200.000, desimal koma) tetap dipakai apa adanya (pengali 1).
    hits.push({
      value: base * multiplierFor(m[0]),
      index: m.index,
      length: m[0].length,
    });
  };

  const withRp = /\brp\.?\s?(\d+(?:[.,]\d+)?(?:\s?(?:rb|ribu|juta|jt|k))?|[.,]\d{3})\b/gi;
  for (const m of text.matchAll(withRp)) push(m);

  const withSuffix = /\b(\d+(?:[.,]\d+)?)\s?(rb|ribu|juta|jt|k)\b/gi;
  for (const m of text.matchAll(withSuffix)) push(m);

  if (hits.length === 0) {
    // R2: fallback tanpa awalan "Rp" — titik-ribuan eksplisit (lama) dan
    // angka polos ≥4 digit (baru, mis. "Pengeluaran 30000."). Tanggal,
    // kode, dan angka ≤3 digit tidak diambil sebagai nominal.
    const plain = /\b(?:\d{1,3}(?:\.\d{3})+|\d{4,9})\b/g;
    for (const m of text.matchAll(plain)) {
      const rawMatch = m[0];
      // Tanggal dengan pemisah dash/slash (mis. 2026-03-15, 15/3) → bukan uang
      const beforeChar = text.slice(Math.max(0, m.index - 1), m.index);
      const afterChar = text.slice(
        m.index + rawMatch.length,
        m.index + rawMatch.length + 1
      );
      if (/[-\/]/.test(beforeChar) || /[-\/]/.test(afterChar)) continue;
      // Nomor referensi (kode/no/nomor/pos) → bukan uang
      const beforeText = text.slice(Math.max(0, m.index - 16), m.index);
      if (
        /(?:\bkode\b|\bno\.?|\bnomor\b|\binvoice\b|\bserial\b|\bpos\b)\s*[#:]*\s*$/i.test(
          beforeText
        )
      ) {
        continue;
      }
      if (/\btahun\s*$/i.test(beforeText)) continue;
      push(m);
    }
  }

  // dedupe nilai identik (Rp75.000 dicocokkan 1x saja)
  const seen = new Map<number, MoneyHit>();
  for (const h of hits) if (!seen.has(h.value)) seen.set(h.value, h);
  return [...seen.values()];
}

/** Versi teks tanpa nominal uang — agar "75" di "Rp75.000" tidak dibaca sbg jumlah */
function stripMoney(text: string): string {
  // P3: pola tanggal (ISO & dash/slash pendek) diganti spasi SAMA PANJANG
  // agar tidak terbaca sebagai kuantitas ("…2026-03-15 beli…" → "15" bukan
  // jumlah), sementara index deteksi nominal tetap sejajar.
  const dateRe = /\b\d{4}(?:-\d{2}){1,2}\b|\b\d{1,2}[-/]\d{1,2}(?:[-/]\d{2,4})?\b/g;
  let spaced = "";
  let last = 0;
  for (const m of text.matchAll(dateRe)) {
    spaced += text.slice(last, m.index) + " ".repeat(m[0].length);
    last = m.index + m[0].length;
  }
  spaced += text.slice(last);

  const hits = [...detectMoney(spaced)].sort((a, b) => b.index - a.index);
  let out = spaced;
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

/**
 * Judul transaksi (R1.b): ekstrak inti objek dari kalimat pengguna,
 * lalu normalisasi ke bentuk profesional via normalizeTransactionTitle
 * (pola "[Penjualan|Pembelian|Pembayaran|Pengeluaran] + objek").
 *
 * Kata kerja aktivitas (jual/beli/bayar) TIDAK dibuang di sini —
 * dipakai normalisasi untuk menentukan kategori, lalu ikut dibuang.
 * Jika inti kosong → fallback berlabel edit (bukan judul palsu).
 */
function deriveTitle(text: string, type: TransactionType): string {
  let t = text.trim();
  t = t.replace(/\b(hari ini|kemarin|tadi|barusan)\b/gi, " ");
  t = t.replace(/^(ya|ok|oke|bang|kak|bos)[\s,.]*/i, "");
  // frasa harga: "seharga/per/@/harga X", "Rp30.000", "30rb", "total"
  t = t.replace(
    /(?:\b(?:seharga|per|harga)|@)\s*(?:rp\.?\s?)?\d+(?:[.,]\d+)?\s*(?:rb|ribu|juta|jt|k)?(?:\s*(?:pieces|buah|unit))?/gi,
    " "
  );
  t = t.replace(/\brp\.?\s?\d+(?:[.,]\d+)?\s*(?:rb|ribu|juta|jt|k)?\b/gi, " ");
  t = t.replace(/\b\d+(?:[.,]\d+)?\s*(?:rb|ribu|juta|jt|k)\b/gi, " ");
  t = t.replace(/\b(total|keseluruhan)\b/gi, " ");
  // label intent & konektor satuan bukan objek judul (R2.c)
  t = t.replace(/\b(pemasukan|pengeluaran|pendapatan|penghasilan)\b/gi, " ");
  // "per <satuan>" apa pun ("per loyang", "per buah") = frasa harga
  t = t.replace(/\bper\s+[\p{L}]+/giu, " ");
  t = t.replace(/\bper\b/gi, " ");
  // metode bayar bukan bagian judul
  t = t.replace(
    /\b(cash|tunai|uang pas|transfer|\btf\b|qris|qr|gopay|dana|ovo|shopeepay|linkaja|e-?wallet|wallet)\b/gi,
    " "
  );
  // angka & satuan sisa (kuantitas/nominal)
  t = t.replace(
    new RegExp(`\\b\\d+(?:[.,]\\d+)?\\s*(?:${UNIT_WORDS})?\\b`, "gi"),
    " "
  );
  t = t.replace(/\b\d+(?:[.,]\d+)?\b/gi, " ");
  t = t.replace(/\brp\.?\b/gi, " ");
  t = t.replace(/\b(?:rb|ribu|juta|jt|k)\b\.?/gi, " ");

  const core = normalizeTransactionTitle(type, t);
  if (!core) {
    return type === "income" ? "Penjualan (edit judul ini)" : "Pengeluaran (edit judul ini)";
  }
  return core;
}

/** Tanda stabil pada pertanyaan satuan-vs-total — dipakai deteksi konteks R2.c. */
export const UNIT_TOTAL_ASK_MARK = "per satuan ATAU total";

/**
 * Pertanyaan klarifikasi satuan-vs-total (R2.c #5): hanya berisi info
 * yang pengguna sebutkan (jumlah/nominal) — tanpa tebakan.
 */
function askUnitVsTotal(qty: number | null, amount: number | null): ChatTransactionResponse {
  const parts: string[] = [];
  if (qty !== null && Number.isFinite(qty)) parts.push(`jumlah ${qty}`);
  if (amount !== null && Number.isFinite(amount)) {
    parts.push(`nominal Rp${Math.round(amount).toLocaleString("id-ID")}`);
  }
  return {
    reply:
      (parts.length ? `Aku menemukan ${parts.join(" dan ")}. ` : "") +
      `Itu harga ${UNIT_TOTAL_ASK_MARK} keseluruhan? Contoh jawaban:` +
      ' "3 kg, per kg Rp10.000" atau "total Rp30.000".',
    action_type: "none",
    transaction: null,
  };
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

  // R4: jumlah + 1 nominal TANPA penanda "per/@/seharga"/"total" →
  //     ambigu (harga satuan ATAU total) → tanya, JANGAN buat draft tebakan.
  if (qty && !mentionsTotal && !mentionsPerUnit) {
    return askUnitVsTotal(qty, money[0].value);
  }

  // R3: 1 nominal TANPA jumlah (dan tanpa penanda) → quantity 1,
  //     unit_price = nominal (termasuk nilai hasil pengali rb/ribu/k/juta).
  //     Draft tetap wajib melewati preview & konfirmasi pengguna.
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

/* ===================================================================== */
/* Konteks klarifikasi antar-pesan (R2.c)                                 */
/* ===================================================================== */

export interface ParserHistoryMessage {
  role?: string;
  content?: string;
}

/**
 * Apakah pesan ini hanya jawaban klarifikasi pendek ("pemasukan",
 * "pengeluaran", "50rb", "total", "per buah", …) yang membutuhkan
 * pesan sebelumnya agar bermakna?
 */
export function isClarificationReply(text: string): boolean {
  const lower = text.trim().toLowerCase();
  if (!lower) return true;
  const words = lower.split(/\s+/).filter(Boolean);
  if (words.length > 4) return false;
  if (/^(?:pemasukan|pengeluaran|income|expense|ya|iya|betul|benar|total|satuan|harga|nominal|bisa|lanjut|oke|ok)\b/i.test(lower)) {
    return true;
  }
  // hanya nominal (Rp50rb / 50000 / 30,5rb) atau kombinasi total/unit
  if (/^(?:rp\.?\s?)?\d+(?:[.,]\d+)?\s*(?:rb|ribu|juta|jt|k)?$/i.test(lower)) {
    return true;
  }
  if (/^(?:total|per|per\s+\w+|satuan)\b/i.test(lower)) {
    return true;
  }
  return false;
}

/**
 * Mode Simulasi dengan KONTEKS klarifikasi (R2.c).
 *
 * - Memakai maksimal DUA giliran USER terakhir yang relevan (jawaban
 *   klarifikasi pendek dilewati saat memilih "pesan sebelumnya").
 * - Jawaban klarifikasi ("pemasukan", "50rb", "total", …) dikaitkan ke
 *   pesan transaksi sebelumnya TANPA mengarang data apa pun — hasil
 *   gabungan tetap berisi kata-kata pengguna saja.
 * - Jangan melewati klarifikasi satuan-vs-total (R2.c #5): bila pesan
 *   sebelumnya mempertanyakan "per satuan ATAU total" dan jawaban belum
 *   memuat penanda eksplisit (`per …`/`@`/`seharga`), pertanyaan tetap
 *   diajukan — tidak ada draft hasil tebakan.
 * - `parseSimulation` lama TETAP dipakai apa adanya (kompatibel).
 */
export function parseSimulationWithHistory(
  history: ReadonlyArray<ParserHistoryMessage>
): ChatTransactionResponse {
  const userTexts = history
    .filter((m) => m.role === "user")
    .map((m) => String(m.content ?? "").trim())
    .filter(Boolean);

  const current = userTexts[userTexts.length - 1] ?? "";
  const currentResult = parseSimulation(current);

  // "Pesan sebelumnya" = giliran user terakhir yang BUKAN jawaban klarifikasi
  // (maks. kembali satu giliran substantive — batas 2 giliran relevan).
  let previous = "";
  for (let i = userTexts.length - 2; i >= 0; i -= 1) {
    if (!isClarificationReply(userTexts[i])) {
      previous = userTexts[i];
      break;
    }
  }
  if (!previous) return currentResult;

  const needsContext =
    isClarificationReply(current) || currentResult.action_type === "none";
  if (!needsContext) return currentResult;

  const combinedText = `${previous} ${current}`;
  const combinedResult = parseSimulation(combinedText);

  // R2.c #5: pesan sebelumnya mempertanyakan satuan-vs-total → jangan
  // lewati klarifikasi tersebut dengan draft hasil tebakan.
  const prevAskedUnitTotal = parseSimulation(previous).reply.includes(
    UNIT_TOTAL_ASK_MARK
  );
  const explicitPerUnit = /\bper\b|@|\bseharga\b/i.test(current);
  if (
    prevAskedUnitTotal &&
    combinedResult.action_type === "transaction_ready" &&
    !explicitPerUnit
  ) {
    return askUnitVsTotal(
      combinedResult.transaction?.quantity ?? null,
      combinedResult.transaction?.unit_price ?? null
    );
  }

  // Jangan gandakan informasi: pakai hasil gabungan hanya bila lebih maju
  // (draf siap, atau konteks mengubah hasil tanya); selain itu kembalikan
  // hasil pesan saat ini apa adanya.
  if (combinedResult.action_type === "transaction_ready") return combinedResult;
  if (
    currentResult.action_type === "none" &&
    combinedResult.reply !== currentResult.reply
  ) {
    return combinedResult;
  }
  return currentResult;
}
