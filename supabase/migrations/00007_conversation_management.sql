-- =====================================================================
-- BIZMATE — MIGRATION 00007
-- Conversation Management: GRANT tabel AI + kolom archived_at
-- =====================================================================
-- Basis: verifikasi privilege P4.2 (audit READ-ONLY):
--   - authenticated: SELECT/INSERT ai_conversations & ai_messages
--     TERBUKTI ADA live (chat berjalan), namun TIDAK TERBUKTI di file
--     migration mana pun (ad-hoc) — dibukukan di sini secara idempotent.
--   - DELETE ai_conversations: policy ai_conversations_delete_own sudah
--     ADA (00001:327-329), tetapi GRANT DELETE belum terverifikasi live
--     → digrant di sini agar fitur hapus percakapan berfungsi.
--   - UPDATE ai_conversations: policy ada (00003 SEC-4) → digrant untuk
--     tahap arsip/judul P4.3.
--   - ai_messages: tetap TANPA policy UPDATE/DELETE (immutable) — peng
--     hapusan percakapan cukup DELETE 1 baris ai_conversations; pesan
--     ikut lewat FK `ai_messages.conversation_id ON DELETE CASCADE`
--     (00001:165; confdeltype 'c' — diterapkan trigger RI sebagai pemilik
--     tabel, tidak membutuhkan GRANT/policy di ai_messages).
--   - SQL LENGKAP AMAN: tabel transaksi TIDAK memiliki FK ke tabel AI
--     (00001) — hapus percakapan mustahil menyentuh data transaksi.
--   - archived_at: kolom BARU untuk P4.3 (arsip percakapan) — sekarang
--     hanya disiapkan (ADD COLUMN IF NOT EXISTS), tanpa perubahan RLS.
--
-- RLS: TIDAK diubah sama sekali (policy 00001/00003 sudah benar).
-- Idempotent: GRANT/REVOKE set-semantik; ADD COLUMN IF NOT EXISTS.
-- Prasyarat fail-fast: kedua tabel AI wajib ada (00001).
-- Aman dijalankan berulang kali; tanpa service_role & tanpa secret.
-- Cara menjalankan: Supabase Dashboard → SQL Editor → paste → Run
-- (TIDAK via `supabase db push`).
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 0. PRASYARAT (fail-fast, bukan perubahan skema)
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public.ai_conversations') is null
     or to_regclass('public.ai_messages') is null then
    raise exception
      'Prasyarat belum terpenuhi: tabel public.ai_conversations / public.ai_messages belum ada. Jalankan 00001_core_schema.sql terlebih dahulu.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 1. PRIVILEGES — pembukuan + pengaktifan yang dibutuhkan P4.2/P4.3
--    SELECT & INSERT: sudah dipakai live (chat) — grant ulang idempotent
--    supaya file & kondisi live selaras.
--    UPDATE & DELETE `ai_conversations`: DIBUTUHKAN fitur hapus/arsip.
--    ai_messages: TIDAK diberi UPDATE/DELETE (immutable by design).
--    Tanpa TRUNCATE/REFERENCES/TRIGGER (tidak dibutuhkan aplikasi).
-- ---------------------------------------------------------------------
grant select, insert, update, delete
  on table public.ai_conversations
  to authenticated;

grant select, insert
  on table public.ai_messages
  to authenticated;

-- ---------------------------------------------------------------------
-- 2. REVOKE — hak akses tabel AI untuk role lain (anon & PUBLIC) dicabut
--    seluruhnya (defensif & pembukuan; tabel ini seharusnya memang polos)
-- ---------------------------------------------------------------------
revoke all on table public.ai_conversations from anon;
revoke all on table public.ai_conversations from public;
revoke all on table public.ai_messages from anon;
revoke all on table public.ai_messages from public;

-- ---------------------------------------------------------------------
-- 3. KOLOM ARSIP (P4.3) — ADD COLUMN IF NOT EXISTS, nullable, tanpa RLS
-- ---------------------------------------------------------------------
alter table public.ai_conversations
  add column if not exists archived_at timestamptz null;

commit;
