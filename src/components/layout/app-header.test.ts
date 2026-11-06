import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Pengujian judul header aplikasi (fix header kasir):
 * Bug: PAGE_TITLES tidak memuat /kasir → header /kasir menampilkan
 * "Dashboard" (fallback). Fix: entri /kasir ditambahkan.
 *
 * Dijaga:
 * - Judul semua route lain TIDAK berubah.
 * - Sidebar tidak disentuh oleh fix ini (ketentuan scope).
 */

const source = readFileSync(
  fileURLToPath(new URL("./app-header.tsx", import.meta.url)),
  "utf8"
);

describe("app-header — pemetaan judul per route", () => {
  it("route /kasir dipetakan ke judul 'Kasir'", () => {
    expect(source).toContain(
      `{ match: (p) => p === "/kasir" || p.startsWith("/kasir/"), title: "Kasir" }`
    );
  });

  it("judul route lain tidak berubah (entri lama tetap persis)", () => {
    for (const entry of [
      `{ match: (p) => p === "/dashboard", title: "Dashboard" }`,
      `{ match: (p) => p.startsWith("/transaksi/baru"), title: "Tambah Transaksi" }`,
      `{ match: (p) => p.startsWith("/transaksi"), title: "Transaksi" }`,
      `{ match: (p) => p.startsWith("/assistant"), title: "AI Assistant" }`,
      `{ match: (p) => p.startsWith("/produk"), title: "Produk" }`,
      `{ match: (p) => p.startsWith("/laporan"), title: "Laporan" }`,
      `{ match: (p) => p.startsWith("/pengaturan"), title: "Pengaturan" }`,
    ]) {
      expect(source).toContain(entry);
    }
  });

  it("fallback 'Dashboard' tetap ada untuk route tak dikenal", () => {
    expect(source).toContain(`?.title ?? "Dashboard"`);
    // fallback TIDAK dipakai untuk /kasir (entri eksplisit ditambahkan)
    expect(source).not.toContain(`"kasir");\n?? `);
    expect(source).toContain(`title: "Kasir"`);
  });

  it("sidebar tidak diubah oleh fix ini (tetap memuat nav Kasir lama)", () => {
    const sidebar = readFileSync(
      fileURLToPath(new URL("./app-sidebar.tsx", import.meta.url)),
      "utf8"
    );
    expect(sidebar).toContain(`{ label: "Kasir", href: "/kasir"`);
  });
});
