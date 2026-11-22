/* Quantity boxes that are READY (owner 2026-11-15: «انا مش عايزه يبقى لما تدوس عليها تتحدد، انا عايزه يبقى بتحدد جاهز. لو انا عايزه
   بالرقم ده هدوس انتر هينزل على اللي بعده، لو مش عايزه هدوس الرقم اللي انا عايزه وخلاص على طول، 5 10 50 براحتي، وبعدين ادوس انتر»).
   Every quantity box (input[data-qty]: «الطلبيات ← تعديل الأصناف» and the quantities of «الوارد») works like a form to fill in:
   - the first box of a list is ALREADY under the cursor with its number selected (AskerQty.ready), so typing a number replaces it;
   - the number is selected whenever a box gets the cursor (by Enter, by a tap, by Tab), never a number to delete first;
   - Enter goes to the next box (ticked rows only, the ones you can see), with that number selected too; on the last one the keyboard closes;
   - the phone's keyboard shows «التالي» (next) / «تم» (done) on its Enter key.
   A box keeps firing its own «change» when the cursor leaves it, so what was typed is saved exactly as before.
   2026-11-22 (owner: «عايزك تطبق [في] اي [خانة] ارقام … الرقم اللي هغيره بمربع ازرق كده اكتب فيه على طول، ما اقعدش امسح … زي ما بيحصل في
   التعديل في المبيعات، لما باجي اعدل السعر»): the selection now holds for EVERY number box of the page (a price, a quantity, an amount, an
   expiry typed as digits: type=number, inputmode decimal / numeric), not only the quantity lists. A phone number (type / inputmode «tel») is
   left as it is, and a box can opt out with data-no-select. Enter-to-the-next stays for the quantity lists only (other boxes have their own Enter). */
(function (root) {
  'use strict';
  const SEL = 'input[data-qty]';
  const NUM = 'input[data-qty], input[type="number"], input[inputmode="decimal"], input[inputmode="numeric"]';
  const isNum = (t) => !!(t && t.matches && t.matches(NUM) && !t.matches('[type="tel"], [inputmode="tel"], [data-no-select]') && !t.readOnly && !t.disabled);
  const usable = (el) => el && !el.disabled && !el.readOnly && el.getClientRects().length > 0 && !el.closest('.off');
  const all = (scope) => [...(scope || document).querySelectorAll(SEL)].filter(usable);
  function pick(el) {
    if (!el) return false;
    try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); }
    try { el.select(); } catch (e) {}
    try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) {}
    return true;
  }
  // the first box of a list under the cursor, number selected; never takes the cursor away from something he is typing in
  function ready(scope) {
    const a = document.activeElement;
    if (a && a !== document.body && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return false;
    return pick(all(scope)[0]);
  }
  const api = { ready, all, pick, isNum };
  root.AskerQty = api;
  if (typeof document === 'undefined') return;
  let fresh = null;
  document.addEventListener('focusin', (e) => {
    const t = e.target;
    if (!isNum(t)) return;
    if (t.matches(SEL)) {
      const list = all(), i = list.indexOf(t);
      t.setAttribute('enterkeyhint', i >= 0 && i < list.length - 1 ? 'next' : 'done');
    }
    fresh = t;
    setTimeout(() => { try { t.select(); } catch (err) {} }, 0);
    setTimeout(() => { if (fresh === t) fresh = null; }, 400);
  });
  // a finger or a mouse button lifted right after the cursor arrived must not drop the selection
  document.addEventListener('mouseup', (e) => { if (e.target === fresh) e.preventDefault(); });
  document.addEventListener('keydown', (e) => {
    const t = e.target;
    if (e.key !== 'Enter' || e.isComposing || !t.matches || !t.matches(SEL)) return;
    e.preventDefault();
    const list = all(), i = list.indexOf(t);
    if (i >= 0 && i < list.length - 1) pick(list[i + 1]); else t.blur();
  });
})(typeof window === 'undefined' ? globalThis : window);
