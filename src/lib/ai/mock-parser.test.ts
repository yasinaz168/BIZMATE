import { describe, expect, it } from "vitest";
import {
  isClarificationReply,
  parseSimulation,
  parseSimulationWithHistory,
} from "./mock-parser";

/**
 * P3 — pemahaman transaksi terpercakapan (Mode Simulasi).
 * 8 kasus mandat audit + regresi. Semuanya draft: penyimpanan transaksi
 * TIDAK otomatis (tetap lewat preview/konfirmasi + validate server).
 */

const READY = "transaction_ready" as const;
const NONE = "none" as const;

describe("P3 — 8 kasus mandat", () => {
  it("1. 'Tadi beli gula 30rb.' → expense 1 × 30.000 (draf siap)", () => {
    const r = parseSimulation("Tadi beli gula 30rb.");
    expect(r.action_type).toBe(READY);
    expect(r.transaction).not.toBeNull();
    expect(r.transaction?.type).toBe("expense");
    expect(r.transaction?.quantity).toBe(1);
    expect(r.transaction?.unit_price).toBe(30000);
    expect(r.transaction?.title?.toLowerCase()).toContain("gula");
    expect(r.reply).toMatch(/(isi 1|bisa diubah|edit)/i);
  });

  it("2. 'Saya beli bahan kue Rp30.000.' → expense 1 × 30.000", () => {
    const r = parseSimulation("Saya beli bahan kue Rp30.000.");
    expect(r.action_type).toBe(READY);
    expect(r.transaction?.type).toBe("expense");
    expect(r.transaction?.quantity).toBe(1);
    expect(r.transaction?.unit_price).toBe(30000);
    expect(r.transaction?.title).toBe("Pembelian bahan kue");
  });

  it("3. 'Pengeluaran 30000.' → expense 1 × 30.000", () => {
    const r = parseSimulation("Pengeluaran 30000.");
    expect(r.action_type).toBe(READY);
    expect(r.transaction?.type).toBe("expense");
    expect(r.transaction?.quantity).toBe(1);
    expect(r.transaction?.unit_price).toBe(30000);
  });

  it("4. 'Saya beli gula 30 ribu.' → expense 1 × 30.000", () => {
    const r = parseSimulation("Saya beli gula 30 ribu.");
    expect(r.action_type).toBe(READY);
    expect(r.transaction?.type).toBe("expense");
    expect(r.transaction?.quantity).toBe(1);
    expect(r.transaction?.unit_price).toBe(30000);
    expect(r.transaction?.title).toBe("Pembelian gula");
  });

  it("5. 'Saya jual 10 gelas es teh @5.000.' → income 10 × 5.000", () => {
    const r = parseSimulation("Saya jual 10 gelas es teh @5.000.");
    expect(r.action_type).toBe(READY);
    expect(r.transaction?.type).toBe("income");
    expect(r.transaction?.quantity).toBe(10);
    expect(r.transaction?.unit_price).toBe(5000);
    expect(r.transaction?.title).toBe("Penjualan es teh");
  });

  it("6. 'Saya beli gula.' → tetap Bertanya nominal (tanpa draf)", () => {
    const r = parseSimulation("Saya beli gula.");
    expect(r.action_type).toBe(NONE);
    expect(r.transaction).toBeNull();
    expect(r.reply).toMatch(/berapa.*nilainya/i);
  });

  it("7. 'Saya beli 3 kg gula Rp30.000.' → TIDAK mengarang; Bertanya satuan vs total", () => {
    const r = parseSimulation("Saya beli 3 kg gula Rp30.000.");
    expect(r.action_type).toBe(NONE);
    expect(r.transaction).toBeNull(); // tak ada draf berbasis tebakan
    expect(r.reply).toMatch(/per satuan|keseluruhan/i);
  });

  it("8. dua nominal → TIDAK digabung; Bertanya kejelasan", () => {
    const r = parseSimulation(
      "Saya beli gula Rp30.000 dan kopi Rp20.000."
    );
    expect(r.action_type).toBe(NONE);
    expect(r.transaction).toBeNull();
    expect(r.reply).toMatch(/tidak mau menebak|tulis jelas/i);
  });
});

describe("P3 — regresi format nominal", () => {
  it("Rp75.000 tetap 75000 (contoh pokok)", () => {
    const r = parseSimulation("Saya jual 3 kaos @Rp75.000.");
    expect(r.action_type).toBe(READY);
    expect(r.transaction?.quantity).toBe(3);
    expect(r.transaction?.unit_price).toBe(75000);
  });

  it("'75rb' → 75.000 (pengali rb)", () => {
    const r = parseSimulation("Saya beli kopi 75rb.");
    expect(r.transaction?.unit_price).toBe(75000);
  });

  it("'2juta' → 2.000.000 (pengali juta)", () => {
    const r = parseSimulation("Saya beli mesin 2juta.");
    expect(r.action_type).toBe(READY);
    expect(r.transaction?.unit_price).toBe(2_000_000);
  });

  it("'30,5rb' desimal koma dengan pengali → 30.500", () => {
    const r = parseSimulation("Saya bayar langganan 30,5rb.");
    expect(r.transaction?.unit_price).toBe(30500);
  });

  it("'Rp 30.000' dengan spasi tetap terbaca", () => {
    const r = parseSimulation("Saya beli gula Rp 30.000.");
    expect(r.transaction?.unit_price).toBe(30000);
  });

  it("total eksplisit tanpa jumlah → 1 × nominal", () => {
    const r = parseSimulation("Saya beli beras total Rp225.000.");
    expect(r.action_type).toBe(READY);
    expect(r.transaction?.quantity).toBe(1);
    expect(r.transaction?.unit_price).toBe(225000);
  });

  it("2 nominal dengan penanda per + jumlah → draf satuan (regresi positif)", () => {
    const r = parseSimulation(
      "Saya jual 3 buah per buah Rp75.000."
    );
    expect(r.action_type).toBe(READY);
    expect(r.transaction?.quantity).toBe(3);
    expect(r.transaction?.unit_price).toBe(75000);
  });

  it("tanggal 'kemarin' tetap terisi", () => {
    const r = parseSimulation("Kemarin beli gula 30rb.");
    expect(r.action_type).toBe(READY);
    expect(r.transaction?.transacted_at).not.toBeNull();
  });

  it("tanggal ISO pada teks TIDAK dianggap nominal", () => {
    const r = parseSimulation("2026-03-15 beli gula 30rb.");
    expect(r.action_type).toBe(READY);
    expect(r.transaction?.quantity).toBe(1);
    expect(r.transaction?.unit_price).toBe(30000);
  });
});

describe("P3 — kalimat tanpa maksud transaksi", () => {
  it("salam biasa → balasan bingung yang jujur, tanpa draf", () => {
    const r = parseSimulation("halo apa tadi sudah diproses?");
    expect(r.action_type).toBe(NONE);
    expect(r.transaction).toBeNull();
    expect(r.reply).toContain("belum menangkap");
  });
});

describe("R1.b — judul semantik end-to-end (matriks target produk)", () => {
  it("'Aku tadi bayar tagihan token listrik toko 100rb pakai QRIS' → Pembayaran token listrik toko", () => {
    const r = parseSimulation(
      "Aku tadi bayar tagihan token listrik toko 100rb pakai QRIS"
    );
    expect(r.action_type).toBe(READY);
    expect(r.transaction?.type).toBe("expense");
    expect(r.transaction?.unit_price).toBe(100000);
    expect(r.transaction?.title).toBe("Pembayaran token listrik toko");
    expect(r.transaction?.payment_method).toBe("qris");
  });

  it("'Beli bahan-bahan kue 90 ribu tunai' → Pembelian bahan kue", () => {
    const r = parseSimulation("Beli bahan-bahan kue 90 ribu tunai");
    expect(r.action_type).toBe(READY);
    expect(r.transaction?.type).toBe("expense");
    expect(r.transaction?.unit_price).toBe(90000);
    expect(r.transaction?.title).toBe("Pembelian bahan kue");
    expect(r.transaction?.payment_method).toBe("cash");
  });

  it("'Tadi jual es teh 50rb tunai' → Penjualan es teh", () => {
    const r = parseSimulation("Tadi jual es teh 50rb tunai");
    expect(r.action_type).toBe(READY);
    expect(r.transaction?.type).toBe("income");
    expect(r.transaction?.unit_price).toBe(50000);
    expect(r.transaction?.title).toBe("Penjualan es teh");
  });

  it("'Jual loyang brownies 220 ribu' → Penjualan loyang brownies", () => {
    const r = parseSimulation("Jual loyang brownies 220 ribu");
    expect(r.action_type).toBe(READY);
    expect(r.transaction?.type).toBe("income");
    expect(r.transaction?.unit_price).toBe(220000);
    expect(r.transaction?.title).toBe("Penjualan loyang brownies");
  });

  it("judul tidak mengandung nominal/kuantitas (anti-fabrikasi)", () => {
    const r = parseSimulation("Tadi jual es teh 50rb tunai");
    expect(r.transaction?.title).not.toMatch(/\d/);
  });
});

/* ===================================================================== */
/* R2 — Income Intent Detection & Clarification Context                   */
/* ===================================================================== */

describe("R2.a/b — deteksi intent (akar kata + tie-break + kata kunci)", () => {
  it("reproduksi bug: 'menjual 100 roti brekele dengan pembayaran Qris' → income, bukan 'belum menangkap'", () => {
    const r = parseSimulation(
      "Hari ini aku menjual 100 roti brekele dengan pembayaran Qris"
    );
    // tidak lagi bentrok dengan substring "bayar" di "pembayaran"
    expect(r.reply).not.toContain("belum menangkap");
    expect(r.reply).toContain("pemasukan");
    // harga tak disebut → tetap tanya nominal (TIDAK dikarang)
    expect(r.action_type).toBe(NONE);
    expect(r.transaction).toBeNull();
    expect(r.reply).toContain("Berapa nilainya");
  });

  it("'Membayar tagihan listrik' → expense (imbuhan me- dikenali)", () => {
    const r = parseSimulation("Membayar tagihan listrik");
    expect(r.reply).not.toContain("belum menangkap");
    expect(r.reply).toContain("pengeluaran");
    expect(r.reply).toContain("Berapa nilainya");
  });

  it("'Dibayar gaji karyawan' → expense (imbuhan di- dikenali)", () => {
    const r = parseSimulation("Dibayar gaji karyawan");
    expect(r.reply).toContain("pengeluaran");
    expect(r.action_type).toBe(NONE);
  });

  it("'Terjual 3 kopi' → income (imbuhan ter- dikenali)", () => {
    const r = parseSimulation("Terjual 3 kopi");
    expect(r.reply).toContain("pemasukan");
    expect(r.reply).toContain("Berapa nilainya");
    expect(r.action_type).toBe(NONE);
  });

  it("'Pemasukan' & 'Pengeluaran' dikenali sebagai klarifikasi jenis", () => {
    expect(parseSimulation("pemasukan").reply).toContain("pemasukan");
    expect(parseSimulation("pemasukan").reply).not.toContain("belum menangkap");
    expect(parseSimulation("pengeluaran").reply).toContain("pengeluaran");
    expect(parseSimulation("pengeluaran").reply).not.toContain("belum menangkap");
  });

  it("'belimbing' TIDAK memicu aktivitas 'beli'; 'beli belimbing' tetap expense", () => {
    expect(parseSimulation("belimbing saja 10rb").reply).toContain("belum menangkap");
    const r = parseSimulation("beli belimbing 10rb");
    expect(r.transaction?.type).toBe("expense");
    expect(r.action_type).toBe(READY);
    expect(r.transaction?.title).toBe("Pembelian belimbing");
  });
});

describe("R2.c — konteks klarifikasi antar-pesan (parseSimulationWithHistory)", () => {
  const user = (content: string) => ({ role: "user", content });

  it("nominal setelah 'pemasukan' mempertahankan produk & quantity (tanpa duplikasi)", () => {
    const r = parseSimulationWithHistory([
      user("100 roti brekele 5000 per buah"),
      user("pemasukan"),
    ]);
    expect(r.action_type).toBe(READY);
    expect(r.transaction?.type).toBe("income");
    expect(r.transaction?.quantity).toBe(100);
    expect(r.transaction?.unit_price).toBe(5000);
    expect(r.transaction?.title).toBe("Penjualan roti brekele");
  });

  it("'beli kopi' + klarifikasi 'pengeluaran' + nominal → konteks utuh", () => {
    const r = parseSimulationWithHistory([
      user("beli kopi"),
      user("pengeluaran"),
      user("20rb"),
    ]);
    expect(r.action_type).toBe(READY);
    expect(r.transaction?.type).toBe("expense");
    expect(r.transaction?.unit_price).toBe(20000);
    expect(r.transaction?.title).toBe("Pembelian kopi");
  });

  it("klarifikasi satuan-vs-total TIDAK dilewati (R2.c #5): jawaban tanpa penanda → tanya lagi", () => {
    const r = parseSimulationWithHistory([
      user("beli 3 kg gula 30rb"),
      user("iya"),
    ]);
    expect(r.action_type).toBe(NONE);
    expect(r.transaction).toBeNull();
    expect(r.reply).toContain("per satuan ATAU total");
  });

  it("jawaban eksplisit 'per buah' setelah klarifikasi satuan → draft lanjut", () => {
    const r = parseSimulationWithHistory([
      user("jual 10 gelas es teh 5000"),
      user("5000 per buah"),
    ]);
    expect(r.action_type).toBe(READY);
    expect(r.transaction?.quantity).toBe(10);
    expect(r.transaction?.unit_price).toBe(5000);
  });

  it("nominal yang tidak disebut TIDAK pernah dikarang", () => {
    const r = parseSimulationWithHistory([
      user("menjual 100 roti brekele"),
      user("pemasukan"),
    ]);
    expect(r.action_type).toBe(NONE);
    expect(r.transaction).toBeNull();
    expect(r.reply).toContain("Berapa nilainya");
  });

  it("isClarificationReply: jawaban pendek vs pesan substantive", () => {
    expect(isClarificationReply("pemasukan")).toBe(true);
    expect(isClarificationReply("50rb")).toBe(true);
    expect(isClarificationReply("total")).toBe(true);
    expect(isClarificationReply("beli 3 kg gula 30rb")).toBe(false);
    expect(isClarificationReply("100 roti brekele 5000 per buah")).toBe(false);
  });

  it("tanpa pesan sebelumnya → tetap memakai parseSimulation biasa", () => {
    const r = parseSimulationWithHistory([user("pemasukan")]);
    expect(r.action_type).toBe(NONE);
    expect(r.reply).toContain("Berapa nilainya");
  });

  it("pesan non-user tidak dibaca sebagai konteks", () => {
    const r = parseSimulationWithHistory([
      { role: "assistant", content: "Apakah pemasukan?" },
      user("pemasukan"),
    ]);
    expect(r.action_type).toBe(NONE);
    expect(r.reply).toContain("Berapa nilainya");
  });
});

/* ===================================================================== */
/* R2-QTY — REGRESSION: quantity dipertahankan saat klarifikasi digabung  */
/* ===================================================================== */

describe("R2-QTY — quantity dari pesan awal TIDAK berubah", () => {
  const user = (content: string) => ({ role: "user", content });

  it("reproduksi persis: '…menjual 100 roti brekele…' + '5000 per buah' → quantity 100", () => {
    const r = parseSimulationWithHistory([
      user("Hari ini aku menjual 100 roti brekele dengan pembayaran QRIS"),
      user("5000 per buah"),
    ]);
    expect(r.action_type).toBe(READY);
    expect(r.transaction?.type).toBe("income");
    expect(r.transaction?.title).toBe("Penjualan roti brekele");
    expect(r.transaction?.quantity).toBe(100); // BUKAN 10 — angka utuh dipertahankan
    expect(r.transaction?.unit_price).toBe(5000);
    // total dihitung server oleh validateTransaction: 100 × 5000 = 500000
    expect(r.transaction?.payment_method).toBe("qris");
    expect(r.transaction?.transacted_at).not.toBeNull(); // "hari ini"
  });

  it("quantity 3 dipertahankan (income)", () => {
    const r = parseSimulationWithHistory([
      user("menjual 3 loyang brownies"),
      user("75000 per loyang"),
    ]);
    expect(r.transaction?.quantity).toBe(3);
    expect(r.transaction?.unit_price).toBe(75000);
    // "loyang" bagian dari NAMA produk — tidak boleh terhapus
    expect(r.transaction?.title).toBe("Penjualan loyang brownies");
  });

  it("quantity 10 dipertahankan (income)", () => {
    const r = parseSimulationWithHistory([
      user("menjual 10 gelas es teh"),
      user("5000 per buah"),
    ]);
    expect(r.transaction?.quantity).toBe(10);
    expect(r.transaction?.unit_price).toBe(5000);
  });

  it("quantity 25 dipertahankan (expense)", () => {
    const r = parseSimulationWithHistory([
      user("Hari ini aku membeli 25 kg bahan kue dengan pembayaran tunai"),
      user("9000 per kg"),
    ]);
    expect(r.action_type).toBe(READY);
    expect(r.transaction?.type).toBe("expense");
    expect(r.transaction?.quantity).toBe(25);
    expect(r.transaction?.unit_price).toBe(9000);
    expect(r.transaction?.payment_method).toBe("cash");
    expect(r.transaction?.title).toBe("Pembelian bahan kue");
  });

  it("quantity 100 dipertahankan pada EXPENSE juga (audit lintas jenis)", () => {
    const r = parseSimulationWithHistory([
      user("membeli 100 kemasan box"),
      user("2500 per kemasan"),
    ]);
    expect(r.transaction?.type).toBe("expense");
    expect(r.transaction?.quantity).toBe(100);
    expect(r.transaction?.unit_price).toBe(2500);
    expect(r.transaction?.title).toBe("Pembelian kemasan box");
  });

  it("quantity + nominal TANPA penanda tetap bertanya (P3/R4 tidak berubah)", () => {
    const r = parseSimulationWithHistory([
      user("menjual 100 roti brekele 5000"),
      user("iya"),
    ]);
    expect(r.action_type).toBe(NONE);
    expect(r.transaction).toBeNull();
    expect(r.reply).toContain("per satuan ATAU total");
  });

  it("parseSimulation tunggal pun mempertahankan quantity 100", () => {
    const r = parseSimulation("menjual 100 roti brekele 5000 per buah");
    expect(r.transaction?.quantity).toBe(100);
    expect(r.transaction?.unit_price).toBe(5000);
  });
});
