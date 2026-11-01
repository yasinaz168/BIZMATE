-- =====================================================================
-- BIZMATE — MIGRATION 00006
-- Transaction Mutation Setup: GRANT UPDATE/DELETE + policy anti-POS
-- =====================================================================
-- Basis: hasil verifikasi privilege LIVE (P5.4.5.2, query
-- information_schema.role_table_grants + has_table_privilege):
--   authenticated: SELECT transactions = true
--                  INSERT transactions = true
--                  UPDATE transactions = false   ← dibutuhkan fitur edit
--                  DELETE transactions = false   ← dibutuhkan fitur hapus
--   anon:          SELECT/INSERT/UPDATE/DELETE = false (sesuai kebutuhan)
--   authenticated EXECUTE create_sale = true; anon = false (tidak berubah)
-- Dan kondisi policy live (00001): transactions_update_own &
-- transactions_delete_own hanya memeriksa is_business_owner(business_id)
-- tanpa mengecualikan source 'pos'.
--
-- Isi migration ini (2 bagian, idempotent, satu transaksi):
--   1. Privileges di-dokumentasikan & dijaminkan:
--      - GRANT SELECT, INSERT, UPDATE, DELETE on transactions →
--        authenticated (SELECT/INSERT sudah true live — grant ulang
--        idempotent supaya file dan kondisi live selaras).
--      - REVOKE seluruh privilege transactions dari anon (sudah false —
--        revoke tetap ditulis sebagai dokumentasi defensif).
--      - Tidak ada GRANT kepada PUBLIC (revoke defensif juga).
--   2. Policy UPDATE & DELETE dibuat ulang (nama dipertahankan):
--      - is_business_owner(business_id) di USING/WITH CHECK; dan
--      - transaksi POS dikecualikan dengan source IS DISTINCT FROM 'pos'
--        di semua cabang — edit/hapus POS harus lewat jalur khusus
--        (mis. RPC void, usulan tahap berikutnya), bukan query biasa.
--
-- Prinsip keamanan:
--   - RLS tetap pembatas baris; GRANT hanya membuka gerbang operasi
--     pada level tabel. is_business_owner adalah SECURITY DEFINER
--     anti-rekursif (00001).
--   - Policy SELECT & INSERT TIDAK diubah. Schema & data TIDAK diubah;
--     create_sale & transaction_items TIDAK disentuh (GRANT
--     transaction_items tetap dari 00005).
--   - Tanpa service_role & tanpa secret apa pun.
--   - Idempotent: GRANT/REVOKE bersifat set-semantik (aman ulang);
--     policy memakai drop policy if exists + create policy.
--   - Prasyarat fail-fast: tabel transactions WAJIB sudah ada (00001).
--
-- RISIKO TERSISA (dilaporkan kepada review — TIDAK dipecahkan di scope
-- migration ini):
--   - Policy baru TIDAK membatasi KOLOM: pemilik masih boleh mengubah
--     source, type, total, quantity, unit_price, payment_method, notes,
--     transacted_at, status, dan request_id pada transaksi NON-POS.
--     (pindah-tenant lewat business_id tetap ditolak: WITH CHECK
--     memeriksa is_business_owner(business_id) yang BARU.)
--     Perlindungan kolom perlu trigger/policy kolom tersendiri →
--     rekomendasi terpisah.
--   - Void POS (kembalikan stok secara atomik) belum ada → rekomendasi
--     RPC void_sale diusulkan terpisah.
--   - Belum ada audit table (perubahan hanya tercermin di updated_at).
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 0. PEMERIKSAAN PRASYARAT (fail-fast, bukan perubahan skema)
--    Mengikuti pola 00003: migration berhenti dengan pesan yang jelas
--    bila prasyarat belum terpenuhi.
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public.transactions') is null then
    raise exception
      'Prasyarat belum terpenuhi: tabel public.transactions belum ada. Jalankan 00001_core_schema.sql terlebih dahulu.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 1. PRIVILEGES — transactions
--    Seluruh privilege yang dipakai fitur transaksi aplikasi.
--    SELECT & INSERT (live sudah true) di-grant ulang agar file dan
--    kondisi live selaras — grant ulang tidak mengubah apa pun.
--    Tanpa TRUNCATE/REFERENCES/TRIGGER (tidak dibutuhkan aplikasi).
-- ---------------------------------------------------------------------
grant select, insert, update, delete
  on table public.transactions
  to authenticated;

-- Defensif (dokumentasi): anon TIDAK memiliki privilege pada tabel ini.
revoke all on table public.transactions from anon;

-- Tidak ada GRANT kepada PUBLIC — revoke defensif juga (umumnya no-op,
-- ditulis eksplisit agar file & kondisi live selaras).
revoke all on table public.transactions from public;

-- ---------------------------------------------------------------------
-- 2. POLICY UPDATE — transactions_update_own (nama dipertahankan)
--    - USING      : pemilik bisnis DAN bukan transaksi POS
--    - WITH CHECK : pemilik bisnis (baru) DAN bukan transaksi POS
--      (WITH CHECK berbasis is_business_owner(business_id) BARU juga
--      menutup pindah-tenant lewat edit business_id)
--    source kolom NOT NULL (00001) — IS DISTINCT FROM 'pos' hanya
--    memberikan "bukan pos" tanpa terpengaruh nilai lain.
-- ---------------------------------------------------------------------
drop policy if exists transactions_update_own
  on public.transactions;

create policy transactions_update_own
  on public.transactions
  for update
  using (
    public.is_business_owner(business_id)
    and source is distinct from 'pos'
  )
  with check (
    public.is_business_owner(business_id)
    and source is distinct from 'pos'
  );

-- ---------------------------------------------------------------------
-- 3. POLICY DELETE — transactions_delete_own (nama dipertahankan)
--    - USING: pemilik bisnis DAN bukan transaksi POS.
--      (DELETE tidak memiliki WITH CHECK di PostgreSQL.)
--    Menghapus/mengubah transaksi POS nantinya hanya dimungkinkan lewat
--    jalur khusus (mis. RPC void dengan restore stok atomik) yang
--    diusulkan TERPISAH — bukan di migration ini.
-- ---------------------------------------------------------------------
drop policy if exists transactions_delete_own
  on public.transactions;

create policy transactions_delete_own
  on public.transactions
  for delete
  using (
    public.is_business_owner(business_id)
    and source is distinct from 'pos'
  );

commit;
