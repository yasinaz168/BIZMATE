/**
 * Tipe & kontrak untuk AI Chat Transaction.
 *
 * Kontrak inti: asisten TIDAK PERNAH menyimpan transaksi sendiri.
 * LLM/simulator hanya mengembalikan INTENT; simpan hanya terjadi
 * setelah pengguna menekan tombol Simpan di preview, dan API save
 * memvalidasi ulang semuanya di server.
 */

export type TransactionType = "income" | "expense";

export type PaymentMethod = "cash" | "transfer" | "qris" | "ewallet";

/** Transaksi hasil parse AI — SEMUA field opsional harus lolos validasi */
export interface AiTransaction {
  type: TransactionType;
  title: string;
  quantity: number;
  unit_price: number;
  /** null = pengguna belum menyebut metode → user pilih di preview */
  payment_method: PaymentMethod | null;
  /** "YYYY-MM-DD" — null berarti hari ini (WIB) */
  transacted_at: string | null;
  notes: string;
}

export interface ChatTransactionResponse {
  reply: string;
  action_type: "none" | "transaction_ready";
  transaction: AiTransaction | null;
}

/** Bentuk pesan yang dipakai komponen chat (both initial & new) */
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Transaksi yang tersimpan pada pesan assistant (riwayat) */
  transaction?: AiTransaction | null;
}

/** Validator: hasil normalisasi */
export interface ValidatedTransaction extends AiTransaction {
  total: number;
  /** tanggal final dalam ISO timestamps (sudah jadi timestamptz) */
  transacted_at_iso: string;
}
