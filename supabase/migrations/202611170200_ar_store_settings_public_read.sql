-- Store site, owner 2026-11-17 («ب»): what the owner saves in the bot (⚙ site settings) must reach the visitors.
-- Until now visitors (anon) had NO select on public.ar_store_settings (a visitor's request got 401 «permission denied for table», the row policy
-- «Public read store settings» was there but not the GRANT), so the closed switch's banner, the owner's hero texts, the WhatsApp number and the site's
-- default color never reached the public page (store.js loadSettings() swallowed the error). The server still enforced is_open when an order was sent.
-- Now: a column grant to anon for exactly the columns the store reads (the same list as store/store.js loadSettings). The two transfer numbers
-- stay out (they go only through ar_store_pay_info(), migration 202611170100); id and updated_at stay out too.
-- The old hero texts saved on 2026-11-12 («اطلب من صيدليتك» / «صحتك اولويه your health is periority») would now replace the page's own words
-- (written 2026-11-15 for the pick-up flow), so they are emptied first (null = the page's own words; he can type new ones in ⚙). Old values, kept here:
--   hero_title = 'اطلب من صيدليتك'    hero_text = 'صحتك اولويه your health is periority'
-- Nothing else changes: the open switch (true), the color (flame, day) and the WhatsApp number are what the page shows today or by default.

update public.ar_store_settings
   set hero_title = null
 where id = 1 and hero_title = 'اطلب من صيدليتك';
update public.ar_store_settings
   set hero_text = null
 where id = 1 and hero_text = 'صحتك اولويه your health is periority';

grant select (is_open, closed_message, hero_title, hero_text, whatsapp, theme_color, theme_night)
  on public.ar_store_settings to anon;
