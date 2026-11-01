-- =====================================================================
-- BIZMATE — MIGRATION 00004
-- Grant Permission Tabel products untuk role authenticated
-- =====================================================================
-- Latar belakang (audit permission + audit Product Management):
-- Migration 00001–00003 membuat tabel + RLS policy products, tetapi
-- tidak pernah memberikan GRANT tingkat tabel kepada role authenticated,
-- sehingga operasi aplikasi ditolak PostgreSQL dengan 42501
-- (permission denied for table ...).
--
-- Prinsip keamanan:
--   - Least privilege: HANYA SELECT, INSERT, UPDATE — sesuai kebutuhan
--     fitur Product Management (lihat, tambah, edit termasuk status
--     aktif/nonaktif & stok). TIDAK diberikan DELETE, TRUNCATE,
--     REFERENCES, maupun TRIGGER.
--   - Hanya untuk role `authenticated` — anon TIDAK diberi akses apa pun.
--   - RLS TIDAK diubah: policy products_*_own (is_business_owner) tetap
--     menjadi pembatas baris. GRANT hanya membuka gate tingkat tabel;
--     RLS tetap menjamin setiap baris hanya milik bisnis pemiliknya.
--   - Tidak mengubah/menghapus data apa pun.
--   - Idempotent: GRANT aman dijalankan berulang kali.
-- =====================================================================

begin;

grant select, insert, update
  on table public.products
  to authenticated;

commit;
