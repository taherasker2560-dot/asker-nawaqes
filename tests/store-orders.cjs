// «طلبات» tab helpers (ar/store-orders.js): the WhatsApp link and the confirmation message the owner sends himself.
const assert=require('node:assert/strict');
const O=require('../ar/store-orders.js');
const o={id:12,customer_name:'أحمد محمد',phone:'01012345678',total:165,items:[{name:'PANADOL EXTRA',qty:2,price:45,line_total:90},{name:'ZITHROKAN 500MG 3CAP',qty:1,price:75,line_total:75}]};
const msg=O.confirmMessage(o);
assert.equal(msg,[
 'أهلًا أحمد محمد، معاك صيدلية عسكر.',
 'طلبك رقم 12 وصلنا:',
 '- PANADOL EXTRA × 2 = 90 ج',
 '- ZITHROKAN 500MG 3CAP × 1 = 75 ج',
 'الإجمالي 165 جنيه، والدفع كاش عند الاستلام.',
 'مصاريف التوصيل: ',
 'نأكد الطلب؟'].join('\n'));
const link=O.waLink(o.phone,msg);
assert.ok(link.startsWith('https://wa.me/201012345678?text='),'Egyptian number with 20');
assert.equal(decodeURIComponent(link.split('?text=')[1]),msg);
assert.equal(O.waLink('201012345678',''),'https://wa.me/201012345678?text=');
assert.equal(O.money(1234.5),'1,234.5');
assert.deepEqual(Object.keys(O.STATUS),['new','confirmed','done','cancelled'],'same statuses as ar_store_orders');
console.log('store-orders ok');
