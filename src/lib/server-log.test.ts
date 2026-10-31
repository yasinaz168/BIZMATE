import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logAppError, logDbError, type DbErrorContext } from "./server-log";

/**
 * Pengujian logging error (tahap 2 perbaikan audit).
 *
 * Dijaga:
 * - Error TERCATAT lengkap: kode error, pesan error, lokasi operasi.
 * - TIDAK BOCOR: field sensitif objek error (details/hint/isi request),
 *   data pengguna, API key — karena hanya key code & message yang dibaca.
 * - Anti log-injection: karakter kontrol/di-baru disanitasi.
 */

const CTX: DbErrorContext = {
  route: "api/assistant/chat",
  table: "ai_messages",
  op: "insert",
  step: "pesan pengguna",
};

let errorSpy: ReturnType<typeof vi.spyOn>;

function loggedText(): string {
  return errorSpy.mock.calls
    .map((call: unknown[]) => call.map((part: unknown) => String(part)).join(" "))
    .join("\n");
}

function loggedEntry(): Record<string, unknown> {
  const line = errorSpy.mock.calls
    .map((call: unknown[]) => call.map(String).join(" "))
    .find((s: string) => s.includes("[db-error]"));
  if (!line) throw new Error("tidak ada log [db-error] yang tercatat");
  return JSON.parse(line.slice(line.indexOf("{"))) as Record<string, unknown>;
}

beforeEach(() => {
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
});

describe("logDbError — mencatat error database", () => {
  it("mencatat kode error, pesan error, dan lokasi operasi", () => {
    logDbError(CTX, {
      code: "42501",
      message: 'new row violates row-level security policy for table "ai_messages"',
    });

    const entry = loggedEntry();
    expect(entry.event).toBe("db_error");
    expect(entry.code).toBe("42501");
    expect(entry.message).toContain("row-level security");
    expect(entry.route).toBe("api/assistant/chat");
    expect(entry.table).toBe("ai_messages");
    expect(entry.op).toBe("insert");
    expect(entry.step).toBe("pesan pengguna");
    expect(entry.at).toBeTruthy();
  });

  it("TIDAK mencetak field sensitif objek error (details/hint/field lain)", () => {
    // Simulasi objek error asli yang membawa data sensitif di banyak field
    const leakyError = {
      code: "23505",
      message: "duplicate key value violates unique constraint",
      details: "Key (title)=(JUALAN-RAHASIA-08123456789) already exists.",
      hint: "HINT-RAHASIA sk-super-secret-key",
      request: { body: "LEAK-REQUEST-BODY" },
      config: { headers: { Authorization: "Bearer TOKEN-RAHASIA" } },
    };

    logDbError(CTX, leakyError);

    const log = loggedText();
    expect(log).toContain("23505"); // kode tercatat
    expect(log).toContain("duplicate key"); // pesan error tercatat
    // Data sensitif tidak boleh muncul dalam bentuk apa pun
    expect(log).not.toContain("JUALAN-RAHASIA");
    expect(log).not.toContain("08123456789");
    expect(log).not.toContain("HINT-RAHASIA");
    expect(log).not.toContain("sk-super-secret-key");
    expect(log).not.toContain("LEAK-REQUEST-BODY");
    expect(log).not.toContain("TOKEN-RAHASIA");
  });

  it("menyisipkan karakter kontrol & newline tidak merusak log (anti log-injection)", () => {
    logDbError(CTX, {
      code: "22P02",
      message: 'salah format\n[db-error] {"code":"FAKE-999","message":"injeksi"}\r\n\u0000baris-tambahan',
    });

    const line = errorSpy.mock.calls
      .map((call: unknown[]) => call.map(String).join(" "))
      .find((s: string) => s.includes("[db-error]"))!;
    // Payload harus tetap satu baris JSON yang valid
    const entry = JSON.parse(line.slice(line.indexOf("{"))) as Record<string, unknown>;
    expect(entry.code).toBe("22P02"); // kode ASLI, bukan hasil injeksi
    expect(String(entry.message)).not.toMatch(/[\n\r]/);
  });

  it("memotong pesan error yang sangat panjang", () => {
    logDbError(CTX, { code: "54000", message: "x".repeat(5000) });
    const entry = loggedEntry();
    expect(String(entry.message).length).toBeLessThanOrEqual(300);
    expect(entry.code).toBe("54000");
  });

  it("aman untuk error null/undefined/bukan-objek", () => {
    for (const value of [null, undefined, "teks-aneh", 42]) {
      errorSpy.mockClear();
      logDbError(CTX, value);
      const entry = loggedEntry();
      expect(entry.code).toBe("unknown");
      expect(entry.message).toBe("(tanpa pesan)");
    }
  });
});

describe("logAppError — exception tak terduga", () => {
  it("mencatat nama + pesan exception, bukan objek utuh", () => {
    const err = new Error("gagal memproses");
    logAppError("api/assistant/chat: proses pesan", err);

    const log = loggedText();
    expect(log).toContain("app_error");
    expect(log).toContain("gagal memproses");
    expect(log).toContain("Error");
    expect(log).toContain("api/assistant/chat: proses pesan");
  });

  it("tidak membocorkan field tambahan yang menempel pada objek Error", () => {
    const err = new Error("gagal");
    (err as unknown as Record<string, unknown>).payload = "DATA-PRIBADI-PENGGUNA";
    (err as unknown as Record<string, unknown>).apiKey = "sk-SECRET";

    logAppError("op", err);

    const log = loggedText();
    expect(log).not.toContain("DATA-PRIBADI-PENGGUNA");
    expect(log).not.toContain("sk-SECRET");
  });

  it("aman untuk non-Error (string/objek polos)", () => {
    logAppError("op", "string error");
    logAppError("op", { message: "OBJEK-RAHASIA", secret: "sk-LEAK" });

    const log = loggedText();
    expect(log).toContain("app_error");
    expect(log).not.toContain("OBJEK-RAHASIA");
    expect(log).not.toContain("sk-LEAK");
  });
});
