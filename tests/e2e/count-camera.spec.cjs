// «جرد عشوائي» (owner 2026-11-16: «لو عايز اجرد 20 30 50 ألف صنف ورا بعض … الكاميرا مفتوحة، مش لازم ادوس على زرار تاني … يفتح فوق»):
// the camera is the first thing on the page, STAYS open after each sticker, the next sticker replaces the card, the same sticker
// in front of the camera counts once, and a read never replaces the item that is being edited. A fake camera and a fake barcode
// reader (made-up items only).
const {run,text,assert}=require('./harness.cjs');
const DATA={data_at:'2026-11-16T03:00:00',store:1,sections:[{i:3,n:'TABLETS + CAPSULES'},{i:33,n:'CREAMS'}],items:[
 {i:63476,n:'ITEM ONE TAB',s:3,p:1,b:[{x:'2029-07',k:2,u:0},{x:'2029-08',k:9,u:0}]},
 {i:7,n:'ITEM STRIP',s:3,p:3,b:[{x:'2028-01',k:2,u:1}]},
 {i:132,n:'ITEM CREAM',s:33,p:1,b:[{x:'2029-08',k:1,u:0}]}]};
run('Count camera: stays open after each sticker, on top of the page, the next sticker replaces the card, edits are safe',async({page,table})=>{
 await page.evaluate(d=>{window.__storage['count/stock.json']=JSON.stringify(d);window.__tables.ar_count_entries=[];localStorage.removeItem('asker-ct-queue');localStorage.removeItem('asker-ct-data');
  // a fake camera (a canvas stream) and a fake reader that returns whatever sticker window.__bar names
  window.__bar=null;
  window.BarcodeDetector=class{static async getSupportedFormats(){return['itf','code_128']}async detect(){return window.__bar?[{rawValue:window.__bar,format:'itf'}]:[]}};
  const c=document.createElement('canvas');c.width=320;c.height=90;const x=c.getContext('2d');setInterval(()=>{x.fillStyle='#'+Math.floor(Math.random()*0xffffff).toString(16).padStart(6,'0');x.fillRect(0,0,320,90)},40);
  navigator.mediaDevices.getUserMedia=async()=>c.captureStream(15);
 },DATA);
 await page.click('[data-pgroup="stock"]');
 await page.click('.subbar [data-tab="count"]');
 await page.waitForSelector('#ctSecList [data-ct-open]');
 // the camera box is the first thing of the count page (the very top)
 assert.equal(await page.$eval('#countPanel',p=>p.firstElementChild.id),'ctCam','the camera is on top of the count page');
 await page.click('#ctScanBtn');
 await page.waitForSelector('#ctCam:not(.hidden)');
 assert.equal(await page.evaluate(()=>Math.round(window.scrollY)),0,'the page is at its top when the camera opens');
 // sticker 1 (the cream): its card shows, the camera is STILL open
 await page.evaluate(()=>{window.__bar='1001320829'});
 await page.waitForSelector('#ctHits [data-ct="132"]');
 assert.match(await text(page,'#ctStatus'),/اتقرا: ITEM CREAM/);
 assert.equal(await page.$eval('#ctCam',e=>e.classList.contains('hidden')),false,'the camera stays open after the first item');
 await page.click('#ctHits [data-ct="132"] [data-ct-ok]');
 await page.waitForFunction(()=>window.__tables.ar_count_entries.length===1);
 assert.equal(await page.$eval('#ctCam',e=>e.classList.contains('hidden')),false,'and after «✓ مظبوط»');
 // sticker 2 (item one): the card is replaced, no button pressed in between
 await page.evaluate(()=>{window.__bar='1634760729'});
 await page.waitForSelector('#ctHits [data-ct="63476"]');
 assert.equal(await page.$('#ctHits [data-ct="132"]'),null,'the next sticker replaces the card');
 assert.equal(await page.$eval('#ctCam',e=>e.classList.contains('hidden')),false);
 // the same sticker kept in front of the camera counts once: after «✓ مظبوط» it does not come back as a new item by itself
 await page.click('#ctHits [data-ct="63476"] [data-ct-edit]');
 // an item is being edited: another sticker must not throw its numbers away
 await page.evaluate(()=>{window.__bar=null});await page.waitForTimeout(2300);
 await page.evaluate(()=>{window.__bar='1001320829'});
 await page.waitForFunction(()=>/خلّص الصنف اللي قدامك الأول/.test(document.getElementById('ctStatus').textContent));
 assert.ok(await page.$('#ctHits [data-ct="63476"] [data-ct-save]'),'the editor of the first item is still there');
 assert.equal(await page.$('#ctHits [data-ct="132"]'),null);
 assert.equal(await page.$eval('#ctCam',e=>e.classList.contains('hidden')),false,'the camera stays open');
 // cancel the edit, take the sticker away for a moment, then the cream again: it replaces the card
 await page.click('#ctHits [data-ct="63476"] [data-ct-cancel]');
 await page.evaluate(()=>{window.__bar=null});await page.waitForTimeout(2300);
 await page.evaluate(()=>{window.__bar='1001320829'});
 await page.waitForSelector('#ctHits [data-ct="132"]');
 // the ✕ on the camera stops it; the button starts it again
 await page.evaluate(()=>{window.__bar=null});
 await page.click('#ctCamStop');
 assert.equal(await page.$eval('#ctCam',e=>e.classList.contains('hidden')),true);
 await page.click('#ctScanBtn');
 await page.waitForSelector('#ctCam:not(.hidden)');
 // leaving the count (the other tab) closes it
 await page.click('[data-ct-view="results"]');
 assert.equal(await page.$eval('#ctCam',e=>e.classList.contains('hidden')),true,'leaving the random count closes the camera');
});
