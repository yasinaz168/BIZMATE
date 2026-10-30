# BIZMATE — AI Business Assistant

**Run Your Business. Let AI Handle the Rest.**

Aplikasi SaaS berbasis AI untuk membantu UMKM Indonesia mencatat transaksi,
mengelola data penjualan, memahami kondisi bisnis, dan membuat keputusan
dengan lebih mudah.

## Stack Teknologi

| Kategori     | Teknologi                          |
| ------------ | ---------------------------------- |
| Framework    | Next.js 15 (App Router) + TypeScript |
| Styling      | Tailwind CSS (design system BIZMATE) |
| Komponen UI  | shadcn/ui-style components (tanpa CLI) |
| Icon         | Lucide React                       |
| Database     | Supabase (PostgreSQL) — *Tahap 2*  |
| Grafik       | Recharts                           |
| AI           | LLM API via server-side — *Tahap 4* |
| OCR          | Provider abstraction — *Tahap 5*   |

## Menjalankan Project

```bash
# 1. Install dependensi
npm install

# 2. Salin contoh environment variables (opsional di Tahap 1)
#    C:\copy .env.example .env.local (PowerShell)
copy .env.example .env.local

# 3. Jalankan dev server
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000).

> **Catatan Windows/PowerShell:** jika muncul error
> *"npm.ps1 cannot be loaded because running scripts is disabled"*,
> jalankan sekali di PowerShell:
> `Set-ExecutionPolicy RemoteSigned -Scope CurrentUser`
> lalu tutup dan buka PowerShell lagi.

## Struktur Folder

```
src/
├── app/                  # Halaman (App Router)
│   ├── (marketing)/      # Landing page
│   ├── (auth)/           # Login & Register
│   ├── (app)/            # Aplikasi utama (dashboard, transaksi, dll)
│   └── (legal)/          # Kebijakan privasi & ketentuan layanan
├── components/
│   ├── ui/               # Komponen dasar (button, card, input, dll)
│   ├── layout/           # Sidebar, header, banner demo
│   ├── landing/          # Section landing page
│   ├── dashboard/        # Komponen dashboard
│   ├── auth/             # Shell & form auth
│   └── app/              # Komponen halaman aplikasi
├── lib/                  # Utilitas & data
│   ├── utils.ts          # cn() (gabung class Tailwind)
│   ├── format.ts         # Format Rupiah & tanggal Indonesia
│   └── demo-data.ts      # ⚠️ Data contoh — DIHAPUS di Tahap 2
└── types/                # Tipe bersama
```

## Status Pengembangan (Roadmap)

- [x] **Tahap 1** — Design system, landing page, dashboard (data demo, berlabel
      jelas sebagai demo)
- [ ] **Tahap 2** — Supabase: auth, database + RLS, onboarding, hapus data demo
- [ ] **Tahap 3** — Produk & transaksi manual (CRUD)
- [ ] **Tahap 4** — AI Chat Transaction (LLM via backend)
- [ ] **Tahap 5** — AI Receipt Scanner (OCR, mock mode berlabel)
- [ ] **Tahap 6** — Laporan & grafik dari database
- [ ] **Tahap 7** — AI Business Insights
- [ ] **Tahap 8** — Pengujian menyeluruh

## Environment Variables

Lihat [.env.example](./.env.example). Aturan penting:

- Semua secret lewat environment variables, **tidak pernah** ditulis di source code.
- Kunci yang diawali `NEXT_PUBLIC_` aman untuk browser (anon key Supabase).
- **Service role key dan API key LLM/OCR hanya di server** — jangan pernah
  diawali `NEXT_PUBLIC_`.
