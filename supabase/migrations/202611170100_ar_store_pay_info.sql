-- Store site + the customer's link, owner 2026-11-17: «أوبشن للدفع جوه الموقع وجوه الرابط بتاع العملاء … فودافون كاش … انستا باي».
-- The owner types the pharmacy's two numbers in the bot (⚙ site settings). The site (visitors, anon) reads them through ONE public function,
-- ar_store_pay_info(): it returns only the two numbers and the pharmacy's WhatsApp number (where the customer sends the transfer's picture).
-- Nothing else of ar_store_settings becomes readable by visitors (the table itself still has no SELECT for anon: hero text, colors and the
-- open/closed switch are not touched here).
-- Nothing changes in orders: a transfer order goes as cash with a note «الدفع: تحويل …» (the existing rules and prices stay as they are).

alter table public.ar_store_settings add column if not exists pay_vodafone text;
alter table public.ar_store_settings add column if not exists pay_instapay text;

do $$ begin
  alter table public.ar_store_settings add constraint ar_store_settings_pay_vodafone_chk
    check (pay_vodafone is null or pay_vodafone ~ '^01[0125][0-9]{8}$');
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.ar_store_settings add constraint ar_store_settings_pay_instapay_chk
    check (pay_instapay is null or char_length(pay_instapay) <= 200);
exception when duplicate_object then null; end $$;

-- the owner and staff (row policies decide who) use the two new columns like the others (the table has column grants for authenticated)
grant select (pay_vodafone, pay_instapay) on public.ar_store_settings to authenticated;
grant insert (pay_vodafone, pay_instapay) on public.ar_store_settings to authenticated;
grant update (pay_vodafone, pay_instapay) on public.ar_store_settings to authenticated;

create or replace function public.ar_store_pay_info()
 returns jsonb
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  select jsonb_build_object('vodafone', s.pay_vodafone, 'instapay', s.pay_instapay, 'whatsapp', s.whatsapp)
  from public.ar_store_settings s
  where s.id = 1
$function$;

revoke all on function public.ar_store_pay_info() from public;
grant execute on function public.ar_store_pay_info() to anon, authenticated;
