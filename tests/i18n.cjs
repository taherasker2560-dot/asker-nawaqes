// The English translator (ar/i18n.js): exact texts, templates with numbers or names, joined pieces, the clock and money, and
// the safety rule: a text with an unknown Arabic word (an item's Arabic name, a WhatsApp message) is left exactly as it is.
const assert=require('node:assert/strict');
global.window=global;require('../ar/i18n-en.js');require('../ar/i18n.js');
const I=global.AskerI18n;
I._use({exact:{'الطلبيات':'Orders','{0} من {1} صنف في الطلب، حوالي {2} ج بعد الخصم':'{0} of {1} items in the order, about {2} EGP after discount','اتعلّم {0} صنف «اتطلب» من {1}':'{0} items marked «ordered» from {1}','نيو سيتي':'New City'},
 phrases:{'آخر خصم':'last discount','قايمة':'list','فيه بونص':'has bonus','النهارده':'today','داتا الصيدلية:':'Pharmacy data:'}});
const t=I.translate;
assert.equal(t('الطلبيات'),'Orders');assert.equal(t('  الطلبيات '),' Orders ','spaces around are kept');
assert.equal(t('2 من 3 صنف في الطلب، حوالي 1,846 ج بعد الخصم'),'2 of 3 items in the order, about 1,846 EGP after discount');
assert.equal(t('اتعلّم 4 صنف «اتطلب» من نيو سيتي'),'4 items marked «ordered» from New City','a known name inside a template is translated');
assert.equal(t('اتعلّم 1 صنف «اتطلب» من صيدلية جديدة'),'1 items marked «ordered» from صيدلية جديدة','an unknown name inside stays');
assert.equal(t('آخر خصم 30% · قايمة 08/11 · فيه بونص'),'last discount 30% · list 08/11 · has bonus','joined pieces');
assert.equal(t('داتا الصيدلية: النهارده 4:30 م'),'Pharmacy data: today 4:30 PM','the clock');
// the safety rule: one unknown Arabic word = the text is left as it is
assert.equal(t('آخر خصم عند شركة جديدة'),'آخر خصم عند شركة جديدة');
assert.equal(t('بروفين ٤٠٠ مجم'),'بروفين ٤٠٠ مجم','an Arabic item name is never touched');
assert.equal(t('BRUFEN 400MG'),'BRUFEN 400MG');
// the real dictionary: every template keeps its {n}, nothing in English still has Arabic (but the share entry's name)
const {exact,phrases}=global.AskerEN;const ph=(s)=>(String(s).match(/\{\d+\}/g)||[]).sort().join(',');
for(const [a,e] of Object.entries(exact)){assert.equal(ph(a),ph(e),'placeholders of: '+a);if(!/نواقص عربي/.test(e))assert.ok(!/[؀-ۿ]/.test(e),'Arabic left in: '+e)}
assert.ok(Object.keys(exact).length>600&&Object.keys(phrases).length>50);
I._use(global.AskerEN);
assert.equal(t('الرئيسية'),'Home');assert.equal(t('ملوش رصيد'),'Out of stock');
console.log('i18n ok');
