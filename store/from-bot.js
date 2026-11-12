/* «رجوع للبوت» on the store, owner 2026-11-12: when he opens the store from the bot and leaves it, he must land on the
   bot's main page again, not outside the app. The bot opens store.html?from=bot in the same tab; the store remembers
   that for this tab (sessionStorage) and shows a button back to the bot. Customers never see it. */
(function (root) {
  'use strict';
  const KEY = 'asker-store-from-bot';
  const BOT = 'asker-nawaqes-arabic.html';
  // true when this tab came from the bot: ?from=bot now, or remembered earlier in this tab
  function cameFromBot(search, remembered) {
    return new URLSearchParams(String(search || '')).get('from') === 'bot' || remembered === '1';
  }
  const api = { cameFromBot, BOT };
  root.AskerStoreFromBot = api;
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof document === 'undefined') return;

  let remembered = null;
  try { remembered = sessionStorage.getItem(KEY); } catch (e) {}
  if (!cameFromBot(location.search, remembered)) return;
  try { sessionStorage.setItem(KEY, '1'); } catch (e) {}
  // keep the address clean (the share/copy links of the store never carry ?from=bot)
  if (location.search) {
    try { history.replaceState(history.state, '', location.pathname + location.hash); } catch (e) {}
  }
  const btn = document.getElementById('botBtn');
  if (btn) btn.hidden = false;
})(typeof window !== 'undefined' ? window : globalThis);
