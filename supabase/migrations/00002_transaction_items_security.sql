
-- =====================================================================
-- BIZMATE — MIGRATION 00002
-- Transaction Items Security
-- =====================================================================

begin;

-- 1. Unique index untuk relasi transaksi dan bisnis
create unique index if not exists transactions_id_business_id_uidx
on public.transactions (id, business_id);

-- 2. Pastikan transaksi dan business_id selalu cocok
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'transaction_items_transaction_business_fkey'
      and conrelid = 'public.transaction_items'::regclass
  ) then
    alter table public.transaction_items
    add constraint transaction_items_transaction_business_fkey
    foreign key (transaction_id, business_id)
    references public.transactions (id, business_id)
    on delete cascade;
  end if;
end;
$$;

-- 3. Validasi produk berasal dari bisnis yang sama
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

    if not found then
      raise exception 'Produk tidak ditemukan.';
    end if;

    if v_product_business_id is distinct from new.business_id then
      raise exception 'Produk dan transaksi harus berasal dari bisnis yang sama.';
    end if;
  end if;

  return new;
end;
$$;

-- Batasi penggunaan function dari role aplikasi
revoke all on function public.validate_transaction_item_business()
from public, anon, authenticated;

-- 4. Trigger validasi
drop trigger if exists transaction_items_validate_business
on public.transaction_items;

create trigger transaction_items_validate_business
before insert or update of product_id, business_id
on public.transaction_items
for each row
execute function public.validate_transaction_item_business();

-- 5. Index business_id
create index if not exists transaction_items_business_id_idx
on public.transaction_items (business_id);

-- 6. Policy UPDATE
drop policy if exists transaction_items_update_own
on public.transaction_items;

create policy transaction_items_update_own
on public.transaction_items
for update
using (
  public.is_business_owner(business_id)
)
with check (
  public.is_business_owner(business_id)
);

commit;
