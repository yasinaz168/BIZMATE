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
| Komponen UI  | shadcn/ui-style components         |
| Auth & DB    | Supabase (PostgreSQL + RLS)        |
| Grafik       | Recharts                           |
| Icon         | Lucide React                       |
| AI           | LLM API via server-side — *Tahap 4* |
| OCR          | Provider abstraction — *Tahap 5*   |

## Menjalankan Project

```bash
# 1. Install dependensi
npm install

# 2. Jalankan dev server
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000).

> **Catatan Windows/PowerShell:** jika muncul error
> *"npm.ps1 cannot be loaded because running scripts is disabled"*,
> jalankan sekali di PowerShell:
> `Set-ExecutionPolicy RemoteSigned -Scope CurrentUser`
> lalu tutup dan buka PowerShell lagi.

## Setup Supabase (WAJIB untuk fitur akun & data)

1. **Buat project** di [supabase.com](https://supabase.com) (gratis).
2. **Jalankan migration**: buka menu *SQL Editor* → paste isi
   `supabase/migrations/00001_core_schema.sql` → *Run*.
3. **Daftarkan redirect URL**: *Authentication → URL Configuration → Redirect URLs* →
   tambah `http://localhost:3000/auth/callback`.
4. **Isi `.env.local`** (salin dari `.env.example`):

   ```
   NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
   ```

5. **Restart** dev server.

Jika `.env.local` belum ada, aplikasi tetap hidup dan menampilkan
panduan konfigurasi (halaman SetupNotice) — tidak crash.

<!-- PS: Jangan pernah menaruh SUPABASE_SERVICE_ROLE_KEY di .env.local
     Aplikasi ini tidak membutuhkannya (semua operasi lewat anon key + RLS). -->

## Struktur Folder

```
supabase/
└── migrations/          # SQL migration (jalankan di SQL Editor Supabase)
src/
├── middleware.ts        # Refresh session + protected routes
├── app/
│   ├── (marketing)/     # Landing page
│   ├── (auth)/          # Login, Register + server actions
│   ├── onboarding/      # Pembuatan profil bisnis
│   ├── auth/callback/   # Penukar kode verifikasi email
│   ├── (app)/           # Aplikasi utama (dashboard, transaksi, dll)
│   └── (legal)/         # Kebijakan privasi & ketentuan layanan
├── components/          # ui/ layout/ landing/ dashboard/ auth/ app/
├── lib/
│   ├── supabase/        # client, server, config
│   ├── dashboard-data.ts# Agregasi data dashboard dari Supabase
│   ├── insight.ts       # Insight rule-based dari data nyata
│   ├── time.ts          # Waktu berbasis Asia/Jakarta
│   ├── format.ts        # Rupiah & tanggal Indonesia
│   └── auth-errors.ts   # Terjemahan pesan error auth
└── types/               # Tipe bersama
```

## Keamanan (Ringkas)

- **Row Level Security (RLS)** aktif di semua tabel — pengguna hanya
  dapat membaca/mengubah data bisnis miliknya, diverifikasi di
  **tingkat database**, bukan di aplikasi.
- Session Supabase difresh setiap request via `middleware.ts`, dengan
  `getUser()` yang memvalidasi token ke server Supabase.
- Yang di-expose ke browser hanya **anon key** (publik by design).
  Service role key tidak dipakai di aplikasi ini.
- Semua input formulir divalidasi ulang di server actions.

## Status Pengembangan (Roadmap)

- [x] **Tahap 1** — Design system, landing page, dashboard shell
- [x] **Tahap 2** — Supabase: auth, SQL migration + RLS, onboarding,
      protected routes, profil bisnis, dashboard memakai data asli
      (data demo Tahap 1 dihapus)
- [ ] **Tahap 3** — Produk & transaksi manual (CRUD)
- [ ] **Tahap 4** — AI Chat Transaction (LLM via backend)
- [ ] **Tahap 5** — AI Receipt Scanner (OCR, mock mode berlabel)
- [ ] **Tahap 6** — Laporan & grafik dari database
- [ ] **Tahap 7** — AI Business Insights (LLM)
- [ ] **Tahap 8** — Pengujian menyeluruh

## Environment Variables

Lihat [.env.example](./.env.example). Aturan penting:

- Semua secret lewat environment variables, **tidak pernah** ditulis di source code.
- Kunci yang diawali `NEXT_PUBLIC_` aman untuk browser (anon key Supabase).
- **Service role key dan API key LLM/OCR hanya di server** — jangan pernah
  diawali `NEXT_PUBLIC_`.
