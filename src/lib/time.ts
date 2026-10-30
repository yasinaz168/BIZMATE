/**
 * Helper waktu berbasis zona Asia/Jakarta (WIB, +07:00, tanpa DST).
 * Dipakai untuk agregasi harian/bulanan agar identik dengan
 * pengguna Indonesia, TIDAK bergantung timezone server hosting.
 */

const JAKARTA = "Asia/Jakarta";

/** "yyyy-MM-dd" hari ini menurut kalender Jakarta */
export function jakartaTodayISO(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: JAKARTA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** "yyyy-MM-dd" N hari sebelum hari ini (kalender Jakarta) */
export function jakartaDaysAgoN(days: number): string {
  const today = new Date(`${jakartaTodayISO()}T00:00:00+07:00`);
  const target = new Date(today.getTime() - days * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: JAKARTA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(target);
}

/** Awal hari/awal bulan dalam ISO UTC (untuk filter timestamptz) */
export function isoToStartOfDayUTC(isoDay: string): string {
  return new Date(`${isoDay}T00:00:00+07:00`).toISOString();
}

/** "yyyy-MM" bulan berjalan (Kalender Jakarta) */
export function jakartaMonthISO(): string {
  return jakartaTodayISO().slice(0, 7);
}

/** Tanggal di sebuah baris DB → "yyyy-MM-dd" kalender Jakarta */
export function toJakartaDayISO(dateInput: string | Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: JAKARTA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(typeof dateInput === "string" ? new Date(dateInput) : dateInput);
}

/** "yyyy-MM-dd" → "17 Okt" (label chart) */
export function dayLabel(isoDay: string): string {
  const d = new Date(`${isoDay}T12:00:00+07:00`);
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: JAKARTA,
    day: "numeric",
    month: "short",
  }).format(d);
}
