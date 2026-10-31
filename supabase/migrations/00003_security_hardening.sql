-- =====================================================================
-- BIZMATE — MIGRATION 00003
-- Security Hardening
-- =====================================================================
-- Dasar: audit database (31 Okt 2026) terhadap 00001 & 00002.
--
-- Prasyarat (WAJIB, berurutan):
--   1. 00001_core_schema.sql
--   2. 00002_transaction_items_security.sql
-- Pemeriksaan prasyarat dilakukan OTOMATIS di bagian 0 — migrasi ini
-- berhenti dengan pesan yang jelas bila prasyarat belum terpenuhi.
--
-- Idempotent: AMAN dijalankan berulang kali.
--   - function : create or replace
--   - policy   : drop policy if exists + create policy
--   - index    : create index if not exists
-- Seluruh perubahan dibungkus satu transaksi (begin/commit) sehingga
-- gagal di tengah = rollback bersih, tidak menyisakan status setengah jadi.
--
-- Isi (5 temuan audit):
--   SEC-1  Samakan pesan error trigger validasi produk
--          (tutup oracle keberadaan produk lintas-tenant).
--   SEC-2  Kunci search_path function trigger set_updated_at().
--   SEC-3  Buka policy INSERT profiles (jalur self-heal profil).
--   SEC-4  Buka policy UPDATE ai_conversations (ubah judul percakapan).
--   INT-1  Index transaction_items(product_id) untuk FK ON DELETE SET NULL.
--
-- Sengaja TIDAK disertakan (berisiko — diusulkan terpisah sebagai 00004):
--   - CHECK konsistensi total = round(quantity * unit_price, 2)
--   - Penghapusan FK tunggal transaction_items_transaction_id_fkey
--     (redundan setelah FK komposit 00002)
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 0. PEMERIKSAAN PRASYARAT (fail-fast, bukan perubahan skema)
--    Mencegah migrasi berjalan pada database yang belum siap sehingga
--    tidak terjadi status "setengah mengeras" (half-hardened): misalnya
--    function ter-hardening tetapi FK komposit pelindungnya belum ada.
-- ---------------------------------------------------------------------
do $$
begin
  -- 00001 harus sudah membuat tabel inti transaction_items
  if to_regclass('public.transaction_items') is null then
    raise exception
      'Prasyarat belum terpenuhi: tabel public.transaction_items belum ada. Jalankan 00001_core_schema.sql lebih dulu.';
  end if;

  -- 00002 harus sudah membuat FK komposit penjaga integritas item transaksi
  if not exists (
    select 1
    from pg_constraint
    where conname = 'transaction_items_transaction_business_fkey'
      and conrelid = 'public.transaction_items'::regclass
  ) then
    raise exception
      'Prasyarat belum terpenuhi: FK komposit dari 00002 belum ada. Jalankan 00002_transaction_items_security.sql lebih dulu.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 1. SEC-1 — Tutup oracle keberadaan produk lintas-tenant
--
--    Masalah (00002 baris 47-53): dua pesan error berbeda
--      'Produk tidak ditemukan.'
--      'Produk dan transaksi harus berasal dari bisnis yang sama.'
--    Penyerang terautentikasi dapat INSERT transaction_items miliknya
--    sendiri (diizinkan RLS) dengan product_id hasil tebakan, lalu
--    membedakan kedua pesan untuk mengetahui apakah UUID produk itu ADA
--    di tenant lain — bocornya keberadaan data lintas-tenant.
--
--    Solusi: satu pesan generik untuk kedua cabang, sehingga tidak ada
--    perbedaan sinyal yang bisa dibedakan penyerang.
--
--    Catatan aman: mengganti body function TIDAK memutus binding
--    trigger transaction_items_validate_business yang sudah dipasang
--    oleh 00002 — trigger tetap menunjuk function yang sama.
-- ---------------------------------------------------------------------
create or replace function public.validate_transaction_item_business()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product_business_id uuid;
begin
  if new.product_id is not null then
    select p.business_id
    into v_product_business_id
    from public.products p
    where p.id = new.product_id;

    -- Dua kondisi (produk tidak ada / produk milik bisnis lain)
    -- sengaja digabung ke SATU pesan generik agar tidak menjadi
    -- oracle informasi bagi penyerang.
    if not found
       or v_product_business_id is distinct from new.business_id then
      raise exception 'Produk tidak valid untuk transaksi ini.';
    end if;
  end if;

  return new;
end;
$$;

-- Kunci ACL ulang setelah create or replace (replace mempertahankan
-- grant lama, jadi revoke harus ditegakkan kembali agar function tidak
-- bisa dieksekusi langsung oleh role anon/authenticated).
revoke all on function public.validate_transaction_item_business()
from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. SEC-2 — Kunci search_path function trigger set_updated_at()
--
--    Masalah (00001 baris 19-27): satu-satunya function yang tidak
--    memasang search_path (function lain sudah). Ditandai linter
--    Supabase (function_search_path_mutable) dan tidak konsisten
--    dengan hardening 00002 yang memakai search_path = ''.
--
--    Solusi: kunci search_path = ''.
--    Aman: function hanya memakai now() (pg_catalog — tetap bisa
--    diakses walau search_path kosong) dan variabel record trigger
--    (new). Mengganti body tidak memutus binding 6 trigger
--    *_set_updated_at (profiles, businesses, products, transactions,
--    ai_conversations) yang sudah ada.
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. SEC-3 — Policy INSERT untuk profiles (jalur self-heal profil)
--
--    Masalah (00001 baris 242-248): profiles hanya punya policy
--    SELECT + UPDATE. Pembuatan baris profil sepenuhnya mengandalkan
--    trigger handle_new_user() saat pendaftaran. Jika baris profil
--    tidak pernah terbuat (akun lama sebelum trigger dipasang, atau
--    trigger gagal), pengguna TIDAK bisa memperbaikinya sendiri:
--    INSERT businesses saat onboarding akan gagal keras oleh FK
--    owner_id -> profiles(id), tanpa jalan pemulihan dari sisi aplikasi.
--
--    Solusi: izinkan INSERT baris profil untuk diri sendiri saja.
--    Kepatuhan: with check (auth.uid() = id) — mustahil memasang profil
--    atas nama pengguna lain. DELETE sengaja tetap ditutup (penghapusan
--    profil terjadi lewat cascade dari auth.users).
-- ---------------------------------------------------------------------
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);

-- ---------------------------------------------------------------------
-- 4. SEC-4 — Policy UPDATE untuk ai_conversations
--
--    Masalah (00001 baris 153-156 vs 317-327): tabel memiliki kolom
--    updated_at + trigger ai_conversations_set_updated_at yang jelas
--    mengantisipasi UPDATE, tetapi tidak ada policy UPDATE — RLS
--    memblokir UPDATE secara diam-diam (0 baris terpengaruh, bukan
--    error). Fitur "ubah judul percakapan" akan tampak rusak tanpa
--    pesan kesalahan yang jelas.
--
--    Solusi: izinkan UPDATE percakapan milik bisnis sendiri, dengan
--    guard using + with check yang sama seperti pola businesses_update_own.
--
--    Cakupan sengaja terbatas: DELETE tetap memakai policy lama, dan
--    ai_messages tetap immutable (tanpa policy UPDATE/DELETE) sebagai
--    keputusan desain — riwayat percakapan AI tidak dapat diedit.
-- ---------------------------------------------------------------------
drop policy if exists "ai_conversations_update_own" on public.ai_conversations;
create policy "ai_conversations_update_own" on public.ai_conversations
  for update
  using (public.is_business_owner(business_id))
  with check (public.is_business_owner(business_id));

-- ---------------------------------------------------------------------
-- 5. INT-1 — Index transaction_items(product_id)
--
--    Masalah (00001 baris 130 & 138): FK product_id ... ON DELETE SET NULL
--    mewajibkan PostgreSQL mencari baris transaction_items yang merujuk
--    suatu produk setiap kali produk dihapus/diubah. Tanpa index pada
--    product_id, setiap penghapusan produk = full scan transaction_items
--    + kunci baris lebih lama (menurun performanya seiring data tumbuh).
--
--    Solusi: index tunggal pada product_id. Index existing lain
--    (transaction_id, business_id) tidak mencakup kasus ini.
-- ---------------------------------------------------------------------
create index if not exists transaction_items_product_id_idx
  on public.transaction_items (product_id);

commit;
