/**
 * =====================================================================
 * LOGIKA MURNI FORM TRANSAKSI MANUAL (R2.3) — tanpa React, dapat diuji.
 * =====================================================================
 * Dipakai oleh manual-form.tsx dan oleh unit test agar kontrak antara
 * form ↔ createManualTransactionAction tidak terputus diam-diam.
 *
 * Lifecycle request_id (mengikuti pola POS src/app/(app)/kasir:
 * pos-client.tsx + nextRequestId di src/lib/pos/cart.ts):
 * - Dibuat SEKALI per sesi form memakai crypto.randomUUID() di client.
 * - TETAP sama saat validasi gagal, server error, atau koneksi putus →
 *   retry memakai request_id yang sama (kunci idempotency R2.2).
 * - Baru diganti setelah navigasi sukses ATAU saat proses form baru
 *   benar-benar dimulai (form session baru = mount ulang komponen).
 */

/**
 * Nama field FormData untuk request_id — WAJIB sama dengan yang dibaca
 * oleh createManualTransactionAction (formText(formData, "request_id")).
 * Satu-satunya field tersembunyi di form: request_id BUKAN data sensitif
 * (hanya kunci idempotency) dan TIDAK PERNAH memengaruhi business_id —
 * business_id selalu dari lookup server di action.
 */
export const MANUAL_REQUEST_FIELD = "request_id";

/** UUID request_id untuk satu sesi form (client-side). */
export function newManualRequestId(): string {
  return crypto.randomUUID();
}

/** Tujuan navigasi sukses: detail transaksi (ID dari hasil server). */
export function manualSuccessHref(transactionId: string): string {
  return `/transaksi/${encodeURIComponent(transactionId)}`;
}

/**
 * Pesan sukses — membedakan transaksi BARU dan REPLAY (R2.3):
 * replay harus mengabari pengguna bahwa transaksi sudah pernah diproses
 * dan TIDAK dibuat ulang.
 */
export function manualSuccessMessage(replay: boolean): string {
  return replay
    ? "Transaksi ini sudah pernah diproses sebelumnya dan tidak dibuat ulang."
    : "Transaksi tersimpan.";
}
