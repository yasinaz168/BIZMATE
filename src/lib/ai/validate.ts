import type {
  AiTransaction,
  PaymentMethod,
  TransactionType,
  ValidatedTransaction,
} from "./types";
import { jakartaTodayISO } from "@/lib/time";

/**
 * VALIDATOR TRANSAKSI AI.
 *
 * Prinsip:
 * - Tidak ada yang lolos tanpa diperiksa di SERVER — hasil parse LLM
 *   ataupun hasil edit pengguna di preview DUA-duanya lewat sini.
 * - Total SELALU dihitung di sini (backend), bukan dipercaya dari browser.
 * - Tanggal masa depan ditolak; tanggal mustahil yang tidak ada di
 *   kalender (bulan 00/13, tanggal 00, 31 Feb) juga ditolak, bukan
 *   digeser diam-diam; tanggal "YYYY-MM-DD" dipakai sebagai
 *   hari kalender Jakarta (WIB, tengah hari 12:00 agar aman dari shift).
 * - Kembalikan daftar error dalam Bahasa Indonesia agar bisa
 *   langsung ditampilkan ke pengguna.
 */

const TRANSACTION_TYPES: readonly TransactionType[] = ["income", "expense"];

const PAYMENT_METHODS: readonly PaymentMethod[] = [
  "cash",
  "transfer",
  "qris",
  "ewallet",
];

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Validitas tanggal kalender NYATA (bukan sekadar bentuk YYYY-MM-DD).
 * Menolak tanggal mustahil yang tetap lolos regex: bulan 00/13,
 * tanggal 00, 31 Februari, 30 April, 29 Februari di tahun non-kabisat.
 * Tidak memakai `new Date()` sehingga mustahil melempar exception.
 */
function isValidCalendarDate(isoDay: string): boolean {
  const year = Number(isoDay.slice(0, 4));
  const month = Number(isoDay.slice(5, 7));
  const day = Number(isoDay.slice(8, 10));
  if (month < 1 || month > 12) return false;
  const maxDay = month === 2 && isLeapYear(year) ? 29 : DAYS_IN_MONTH[month - 1];
  return day >= 1 && day <= maxDay;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  data: ValidatedTransaction | null;
}

/** Angka dari LLM/browser selalu dinormalisasi sebelum dipakai */
function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    // "75.000" (format Indonesia) tetap berarti 75000
    const cleaned = value.trim().replace(/[^\d.,-]/g, "").replace(/\./g, "").replace(",", ".");
    const parsed = Number.parseFloat(cleaned);
    if (Number.isFinite(parsed)) return parsed;
  }
  return Number.NaN;
}

export function validateTransaction(raw: unknown): ValidationResult {
  const errors: string[] = [];
  const input = (raw ?? {}) as Record<string, unknown>;

  // ---------- type ----------
  const type = input.type;
  if (typeof type !== "string" || !TRANSACTION_TYPES.includes(type as TransactionType)) {
    errors.push("Jenis transaksi wajib 'income' (pemasukan) atau 'expense' (pengeluaran).");
  }

  // ---------- title ----------
  const rawTitle = typeof input.title === "string" ? input.title.trim() : "";
  if (rawTitle.length < 1) {
    errors.push("Deskripsi transaksi wajib diisi.");
  } else if (rawTitle.length > 160) {
    errors.push("Deskripsi transaksi maksimal 160 karakter.");
  }

  // ---------- quantity ----------
  const quantity = toNumber(input.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    errors.push("Jumlah wajib angka lebih dari 0.");
  }

  // ---------- unit_price ----------
  const unitPrice = toNumber(input.unit_price);
  if (!Number.isFinite(unitPrice) || unitPrice < 0) {
    errors.push("Harga per satuan wajib angka tidak negatif.");
  }

  // ---------- payment_method ----------
  let payment: PaymentMethod | null = null;
  const rawPayment = input.payment_method;
  if (typeof rawPayment === "string" && rawPayment !== "") {
    if (PAYMENT_METHODS.includes(rawPayment as PaymentMethod)) {
      payment = rawPayment as PaymentMethod;
    } else {
      errors.push("Metode pembayaran tidak dikenal.");
    }
  }

  // ---------- transacted_at ----------
  let transactedDay: string;
  const rawDate = input.transacted_at;
  if (rawDate === null || rawDate === undefined || rawDate === "") {
    transactedDay = jakartaTodayISO();
  } else if (typeof rawDate === "string" && ISO_DATE_RE.test(rawDate)) {
    if (!isValidCalendarDate(rawDate)) {
      // Bentuk YYYY-MM-DD benar tetapi tanggalnya tidak ada di kalender
      // (mis. 2026-13-45, 2026-00-10, 2026-10-00, 2026-02-30)
      errors.push(
        "Tanggal transaksi tidak valid (bulan atau tanggalnya tidak ada di kalender)."
      );
    } else {
      // Regangkan (clamp) ke masa lalu — tanggal masa depan tidak valid
      const today = jakartaTodayISO();
      if (rawDate > today) {
        errors.push("Tanggal transaksi tidak boleh di masa depan.");
      }
    }
    transactedDay = rawDate;
  } else {
    errors.push("Format tanggal harus YYYY-MM-DD.");
    transactedDay = jakartaTodayISO();
  }

  // ---------- notes ----------
  const rawNotes = typeof input.notes === "string" ? input.notes.trim() : "";
  if (rawNotes.length > 500) {
    errors.push("Catatan maksimal 500 karakter.");
  }

  if (errors.length > 0) {
    return { valid: false, errors, data: null };
  }

  // 12:00 WIB agar transaksi "hari ini" tidak bergeser ke kemarin
  // (ditukar ke ISO UTC untuk disimpan sebagai timestamptz).
  // Dihitung SETELAH lolos validasi: tanggal dijamin benar-benar ada
  // di kalender sehingga konversi di bawah tidak pernah melempar error.
  const transactedIso = new Date(`${transactedDay}T12:00:00+07:00`).toISOString();

  const total = Math.round(quantity * unitPrice);

  return {
    valid: true,
    errors: [],
    data: {
      type: type as TransactionType,
      title: rawTitle,
      quantity,
      unit_price: unitPrice,
      payment_method: payment,
      transacted_at: transactedDay,
      notes: rawNotes || "",
      total,
      transacted_at_iso: transactedIso,
    },
  };
}
