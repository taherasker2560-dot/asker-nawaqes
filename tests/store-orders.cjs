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
// prescription-only order: the owner writes the medicines and prices himself
const rxMsg=O.confirmMessage({id:13,customer_name:'منى',items:[],total:0,rx_paths:['rx/2026-11-09/a.jpg']});
assert.ok(rxMsg.includes('الروشتة (طلب رقم 13) وصلتنا'));assert.ok(rxMsg.includes('مصاريف التوصيل: '));assert.ok(!rxMsg.includes('0 جنيه'));
// on-order line (2026-11-10): no price, the owner writes it in the message
const lo=O.confirmMessage({id:14,customer_name:'سارة',total:90,items:[{name:'PANADOL EXTRA',qty:2,price:45,line_total:90},{name:'KENACOMB 15GM CREAM',qty:1,price:null,line_total:null,on_order:true}]});
assert.ok(lo.includes('- KENACOMB 15GM CREAM × 1 = (بالطلب) ج'));assert.ok(lo.includes('الإجمالي 90 جنيه + الأصناف اللي بالطلب'));assert.ok(!lo.includes('null'));
assert.deepEqual(Object.keys(O.STATUS),['new','confirmed','done','cancelled'],'same statuses as ar_store_orders');
console.log('store-orders ok');
