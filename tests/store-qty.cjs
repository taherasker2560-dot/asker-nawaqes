// the stock limit in the cart (owner 2026-11-17: an order for more than the pharmacy has must be stopped with a warning): the pure rules of store/store.js
const assert=require('node:assert/strict');
const S=require('../store/store.js');
const cart=[{id:1,name:'PANADOL',qty:5,price:50},{id:2,name:'CONGESTAL',qty:9,on_order:true,price:null},{id:3,name:'TYPED',qty:4,free_text:true},{id:4,name:'ONE',qty:1,price:10},{id:6,name:'MANY',qty:20,price:9}];
// the lines above what the pharmacy has: on-order and typed lines have no limit, an item with no known limit is not blocked
assert.deepEqual(S.overLimit(cart,{1:3,2:1,3:1,4:1,6:20}),[{id:1,name:'PANADOL',qty:5,max:3}]);
assert.deepEqual(S.overLimit(cart,{1:5}),[],'exactly what there is: fine');
assert.deepEqual(S.overLimit(cart,{}),[]);assert.deepEqual(S.overLimit(cart,null),[]);assert.deepEqual(S.overLimit(null,{1:1}),[]);
assert.deepEqual(S.overLimit(cart,{1:'3'}).map(x=>x.max),[3],'the server\'s numbers may come as text');
// the words
assert.deepEqual([1,2,3,10,11,20].map(S.maxText),['المتاح عندنا علبة واحدة بس','المتاح عندنا علبتين بس','المتاح عندنا 3 علب بس','المتاح عندنا 10 علب بس','المتاح عندنا 11 علبة بس','المتاح عندنا 20 علبة بس']);
assert.match(S.ERRORS.qty,/أكتر من المتاح/);
console.log('store-qty ok');