import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  MANUAL_REQUEST_FIELD,
  manualSuccessHref,
  manualSuccessMessage,
  newManualRequestId,
} from "./manual-form-logic";

/**
 * Pengujian logika murni form transaksi manual (R2.3) — terutama
 * KONTRAK request_id antara form ↔ createManualTransactionAction:
 * - request_id dikirim saat submit (nama field sama dengan yang dibaca
 *   server action; verified via pembacaan source — pola kasir/actions.test).
 * - Lifecycle: UUID dibuat client, unik per sesi, tidak terikat render.
 * - Replay → pesan informatif + tujuan = transactionId LAMA.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe("newManualRequestId — dibuat client memakai crypto.randomUUID", () => {
  it("berformat UUID valid", () => {
    expect(UUID_RE.test(newManualRequestId())).toBe(true);
  });

  it("setiap sesi form mendapat UUID berbeda (bukan hasil render yang sama)", () => {
    const a = newManualRequestId();
    const b = newManualRequestId();
    expect(a).not.toBe(b);
    expect(UUID_RE.test(a) && UUID_RE.test(b)).toBe(true);
  });
});

describe("manualSuccessHref — replay maupun baru menuju transactionId dari server", () => {
  it("transaksi baru → detail transaksi baru", () => {
    const id = "11111111-2222-4333-8444-555555555555";
    expect(manualSuccessHref(id)).toBe(`/transaksi/${id}`);
  });

  it("replay → detail transaksi LAMA (transactionId hasil read-back)", () => {
    const oldId = "99999999-8888-4777-8666-555555555555";
    expect(manualSuccessHref(oldId)).toBe(`/transaksi/${oldId}`);
  });

  it("id berisi karakter khusus di-encode aman untuk URL", () => {
    expect(manualSuccessHref("a b/c?d")).toBe("/transaksi/a%20b%2Fc%3Fd");
  });
});

describe("manualSuccessMessage — UX replay (R2.3)", () => {
  it("replay → informatif: sudah pernah diproses & tidak dibuat ulang", () => {
    const msg = manualSuccessMessage(true);
    expect(msg).toContain("sudah pernah diproses");
    expect(msg).toContain("tidak dibuat ulang");
  });

  it("transaksi baru → konfirmasi sederhana", () => {
    const msg = manualSuccessMessage(false);
    expect(msg).toContain("Transaksi tersimpan");
    expect(msg).not.toContain("pernah diproses");
  });
});

describe("kontrak field form ↔ server action (dibaca dari source)", () => {
  const formSource = readFileSync(
    fileURLToPath(new URL("./manual-form.tsx", import.meta.url)),
    "utf8"
  );
  const actionSource = readFileSync(
    fileURLToPath(new URL("./actions.ts", import.meta.url)),
    "utf8"
  );

  it("form mengirim hidden input request_id (kontrak nama field)", () => {
    expect(MANUAL_REQUEST_FIELD).toBe("request_id");
    expect(formSource).toContain('name={MANUAL_REQUEST_FIELD}');
    expect(formSource).toContain('type="hidden"');
  });

  it("action membaca field yang sama dari FormData", () => {
    expect(actionSource).toContain(
      `formText(formData, "${MANUAL_REQUEST_FIELD}")`
    );
  });

  it("hidden input form TIDAK membawa business_id atau field sensitif lain", () => {
    // satu-satunya input tersembunyi adalah request_id
    const hiddenInputs = formSource.match(/type="hidden"/g) ?? [];
    expect(hiddenInputs).toHaveLength(1);
    expect(formSource).not.toContain('name="business_id"');
    expect(formSource).not.toContain('name="total"');
    expect(formSource).not.toContain('name="source"');
    expect(formSource).not.toContain('name="status"');
  });

  it("request_id dibuat memakai crypto.randomUUID (client-side)", () => {
    const logicSource = readFileSync(
      fileURLToPath(new URL("./manual-form-logic.ts", import.meta.url)),
      "utf8"
    );
    // generator berada di modul logika murni (client); form memakainya
    expect(logicSource).toContain("crypto.randomUUID");
    expect(formSource).toContain("newManualRequestId");
    // server action TIDAK PERNAH membuat request_id
    expect(actionSource).not.toContain("crypto.randomUUID");
    expect(actionSource).not.toContain("newManualRequestId");
  });
});
