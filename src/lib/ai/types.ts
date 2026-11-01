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
  /**
   * Status AI saat pesan ini dihasilkan (AI-R2) — dipakai badge per pesan.
   * Opsional untuk pesan lama dari riwayat DB (fallback ke status global).
   */
  aiStatus?: AiStatus;
}

/**
 * Status AI tri-state (AI-R2) — hasil NYATA dari runAssistant,
 * bukan sekadar keberadaan API key:
 * - "connected"      : provider LLM berhasil memberikan respons valid
 * - "simulation"     : tanpa LLM_API_KEY → parser simulasi (didesain)
 * - "provider_error" : provider dipanggil tetapi gagal → fallback simulasi
 */
export type AiStatus = "connected" | "simulation" | "provider_error";

/**
 * Tampilan status AI di UI: tambahan "unknown" untuk kondisi awal
 * halaman sebelum respons pertama diketahui (jangan mengklaim terhubung
 * hanya karena API key tersedia).
 */
export type AiStatusView = AiStatus | "unknown";

/** Alasan aman kondisi non-connected (tanpa detail sensitif). */
export type AiStatusReason =
  | "no_key"
  | "timeout"
  | "network_error"
  | "http_4xx"
  | "http_5xx"
  | "parse_error";

/** Validator: hasil normalisasi */
export interface ValidatedTransaction extends AiTransaction {
  total: number;
  /** tanggal final dalam ISO timestamps (sudah jadi timestamptz) */
  transacted_at_iso: string;
}
