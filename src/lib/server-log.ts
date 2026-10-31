/**
 * LOGGING ERROR SERVER — terstruktur & minimalis (tahap 2 perbaikan audit).
 *
 * Aturan privasi yang DIJAGA (audit /api/assistant/chat):
 * - HANYA mencatat: kode error database, pesan error sistem, dan lokasi
 *   operasi (route + tabel + jenis operasi).
 * - TIDAK PERNAH mencatat: isi pesan pengguna, data transaksi pribadi,
 *   API key, token, password, atau isi .env.local.
 * - Error database datang sebagai objek bebas (mis. PostgRESTError) yang
 *   bisa berisi field sensitif seperti `details` (memuat nilai baris,
 *   contoh: "Key (title)=(judul rahasia)") — field SELAIN code & message
 *   TIDAK pernah dibaca, sehingga mustahil ikut tercatat.
 * - Pesan disanitasi: karakter kontrol/di-baru dibuang (cegah log
 *   injection) dan dipotong agar log tetap ringkas.
 */

/** Lokasi operasi database yang sedang dicatat */
export interface DbErrorContext {
  /** Route handler tempat operasi, mis. "api/assistant/chat" */
  route: string;
  /** Tabel tujuan, mis. "ai_messages" */
  table: string;
  /** Jenis operasi database */
  op: "insert" | "update" | "delete" | "select";
  /** Penanda langkah opsional, mis. "pesan pengguna" */
  step?: string;
}

const MAX_TEXT = 300;

/** Buang karakter kontrol & newline (cegah log injection), rapikan, potong */
function sanitize(value: unknown, max = MAX_TEXT): string {
  if (typeof value !== "string" || value.length === 0) return "";
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, max);
}

/**
 * Catat error database secara terstruktur (satu baris JSON di log server).
 *
 * Parameter sengaja bertipe `unknown`: objek error dari PostgREST bisa
 * membawa field sensitif (`details` memuat nilai baris, `hint`, dsb.), dan
 * fungsi ini HANYA menyentuh dua key — `code` dan `message` — sehingga
 * field lain mustahil ikut tercatat.
 */
export function logDbError(context: DbErrorContext, error: unknown): void {
  const err: Record<string, unknown> =
    typeof error === "object" && error !== null
      ? (error as Record<string, unknown>)
      : {};
  const entry = {
    event: "db_error",
    at: new Date().toISOString(),
    route: sanitize(context.route, 120),
    table: sanitize(context.table, 120),
    op: sanitize(context.op, 20),
    step: sanitize(context.step, 120),
    code: sanitize(err.code, 40) || "unknown",
    message: sanitize(err.message) || "(tanpa pesan)",
  };
  console.error("[db-error]", JSON.stringify(entry));
}

/**
 * Catat exception tak terduga secara aman.
 *
 * Error dicetak sebagai nama + pesan yang sudah disanitasi — TIDAK pernah
 * dicetak utuh, karena objek exception bisa saja membawa data di field
 * tambahannya.
 */
export function logAppError(operation: string, error: unknown): void {
  const name = error instanceof Error ? error.name : typeof error;
  const message = error instanceof Error ? sanitize(error.message) : "";
  const entry = {
    event: "app_error",
    at: new Date().toISOString(),
    operation: sanitize(operation, 120),
    name: sanitize(name, 80) || "unknown",
    message: message || "(tanpa pesan)",
  };
  console.error("[app-error]", JSON.stringify(entry));
}
