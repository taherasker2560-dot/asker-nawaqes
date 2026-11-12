-- 202611121500_ar_customer_phones_many (NOT applied yet: needs the owner's «طبّق»)
-- ASKER: several WhatsApp numbers for one customer (owner 2026-11-12: «عايزين إن أنا أقدر أضيف أكتر من رقم للعميل، عشان في عملاء
-- بيبقى معاهم رقم و2 و3»). One row per number now: the key becomes (customer_id, phone). At most 5 numbers a customer.
-- The numbers already saved stay as they are (each is now that customer's first number). Owner only, as before.
-- Rollback (keeps one number per customer): delete from public.ar_customer_phones a using public.ar_customer_phones b
--   where a.customer_id = b.customer_id and a.updated_at > b.updated_at; drop trigger ar_customer_phones_max on
--   public.ar_customer_phones; drop function public.ar_customer_phones_max(); alter table public.ar_customer_phones drop
--   constraint ar_customer_phones_pkey, add constraint ar_customer_phones_pkey primary key (customer_id);
alter table public.ar_customer_phones drop constraint if exists ar_customer_phones_pkey;
alter table public.ar_customer_phones add constraint ar_customer_phones_pkey primary key (customer_id, phone);

create or replace function public.ar_customer_phones_max()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  if (select count(*) from public.ar_customer_phones p where p.customer_id = new.customer_id and p.phone <> new.phone) >= 5 then
    raise exception 'too many numbers for one customer (max 5)';
  end if;
  return new;
end $function$;
drop trigger if exists ar_customer_phones_max on public.ar_customer_phones;
create trigger ar_customer_phones_max before insert on public.ar_customer_phones
  for each row execute function public.ar_customer_phones_max();
