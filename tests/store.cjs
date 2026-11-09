// Store site helpers (store/store.js): search words, the PostgREST filter, phone numbers, the cart, and error words
// that match the codes ar_store_place_order returns.
const assert=require('node:assert/strict');
const S=require('../store/store.js');

// search words: letters and digits only (no commas or brackets that could break the filter), 2+ letters, max 5
assert.deepEqual(S.searchTerms('  Panadol  extra '),['Panadol','extra']);
assert.deepEqual(S.searchTerms('بانادول'),['بانادول']);
assert.deepEqual(S.searchTerms('أوجمنتين'),['اوجمنتين'],'hamza forms read as ا');
assert.deepEqual(S.searchTerms('a,b),(c*d'),[],'single letters and symbols dropped');
assert.deepEqual(S.searchTerms('zithro,500)'),['zithro','500']);
assert.deepEqual(S.searchTerms('a b c d e f g h ii jj kk ll mm nn'),['ii','jj','kk','ll','mm']);
assert.deepEqual(S.searchTerms('vit vit'),['vit'],'no repeats');
assert.deepEqual(S.searchTerms(''),[]);
assert.equal(S.termFilter('panadol'),'name.ilike.*panadol*,arabic_name.ilike.*panadol*');
assert.equal(S.termFilter('اوجمنتين'),'name.ilike.*_وجمنتين*,arabic_name.ilike.*_وجمنتين*','ا matches أ / إ / ا');

// phone
assert.equal(S.normPhone('01012345678'),'01012345678');
assert.equal(S.normPhone('+20 101 234 5678'),'01012345678');
assert.equal(S.normPhone('٠١٠١٢٣٤٥٦٧٨'),'01012345678','Arabic digits');
assert.equal(S.normPhone('0101234567'),null);
assert.equal(S.normPhone('02123456789'),null);

// money and what can go in the cart
assert.equal(S.money(91.5),'91.5');assert.equal(S.money(1234),'1,234');assert.equal(S.money('x'),'');
assert.equal(S.canAdd({status:'available',price:75,needs_rx:false}),true);
assert.equal(S.canAdd({status:'available',price:null,needs_rx:false}),false,'no price');
assert.equal(S.canAdd({status:'on_order',price:75,needs_rx:false}),false);
assert.equal(S.canAdd({status:'available',price:75,needs_rx:true}),false,'prescription');

// cart: add, add again, change, remove, limits
let c=S.cartAdd([],{id:1,name:'A',price:10});
c=S.cartAdd(c,{id:1,name:'A',price:10});
c=S.cartAdd(c,{id:2,name:'B',arabic_name:'ب',price:2.5});
assert.deepEqual(c,[{id:1,name:'A',arabic_name:null,price:10,qty:2},{id:2,name:'B',arabic_name:'ب',price:2.5,qty:1}]);
assert.equal(S.cartCount(c),3);assert.equal(S.cartTotal(c),22.5);
c=S.cartSet(c,1,0);assert.deepEqual(c.map(x=>x.id),[2],'qty 0 removes the line');
c=S.cartSet(c,2,99);assert.equal(c[0].qty,S.MAX_QTY,'same max qty as the function');
let big=[];for(let i=1;i<=35;i++)big=S.cartAdd(big,{id:i,name:'X'+i,price:1});
assert.equal(big.length,S.MAX_LINES,'same max lines as the function');
const before=[{id:1,name:'A',price:10,qty:1}];S.cartAdd(before,{id:1,name:'A',price:10});assert.equal(before[0].qty,1,'cart is not changed in place');

// every error code the function returns has words
for(const k of ['bad_phone','bad_name','bad_address','bad_items','too_many','item_not_available'])assert.ok(S.errorText(k)!==S.errorText('x'),k);
assert.equal(S.MAX_LINES,30);assert.equal(S.MAX_QTY,20);
assert.deepEqual(Object.keys(S.STATUS),['available','on_order','unavailable'],'same statuses as ar_store_items');
console.log('store ok');
