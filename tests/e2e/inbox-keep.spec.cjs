// Hidden incoming messages are never deleted, and «مسح الكل» leaves photos waiting for their company and messages
// that were not read (each still has its own card), even when they are older than the 3 days the list shows.
const {run,text,assert}=require('./harness.cjs');
run('inbox keeps hidden rows; clear-all leaves unsure and unread',async({page,table})=>{
 const now=Date.now(),iso=ms=>new Date(ms).toISOString();
 await page.evaluate(([a,b,c])=>{window.__tables.ar_inbox=[
  {id:'old',received_at:a,sender:'الفتح',supplier:'الفتح',kind:'text',status:'seen',sure:0,review:0,rows:[],hidden_at:a},
  {id:'unsure',received_at:a,sender:'الفتح',supplier:'الفتح',kind:'image',file_path:'d/x.jpg',status:'new',sure:1,review:0,rows:[],maybe:['الفتح','النور']},
  {id:'unread',received_at:b,sender:'النور',supplier:'النور',kind:'image',file_path:'d/y.jpg',status:'error',error:'Signal timed out.',sure:0,review:0,rows:[]},
  {id:'unread2',received_at:b,sender:'الفتح',supplier:'الفتح',kind:'image',file_path:'d/z.jpg',status:'error',error:'quota',sure:0,review:0,rows:[]},
  {id:'normal',received_at:c,sender:'النور',supplier:'النور',kind:'text',status:'new',sure:0,review:0,rows:[]}]},[iso(now-5*864e5),iso(now-4*864e5),iso(now)]);
 await page.click('[data-tab="read"]');await page.click('#inboxRefresh');
 await page.waitForFunction(()=>/مش معروف|أو/.test(document.getElementById('inboxList')?.textContent||''));
 assert.match(await text(page,'#inboxList'),/الفتح أو النور/,'a 5-day-old unsure photo is still listed');
 assert.ok((await table('ar_inbox')).some(x=>x.id==='old'),'a row hidden 5 days ago is not deleted');
 await page.click('[data-reread="unread"]');
 await page.waitForFunction(()=>window.__tables.ar_inbox.find(x=>x.id==='unread').status==='new');
 assert.ok((await page.evaluate(()=>window.__invokes)).includes('ar:reread'),'«اقرا تاني» asks the server');
 assert.equal((await table('ar_inbox')).length,5,'re-read fills the same row, nothing added');
 page.once('dialog',d=>d.accept());await page.click('#inboxClear');
 await page.waitForFunction(()=>window.__tables.ar_inbox.find(x=>x.id==='normal').hidden_at);
 const rows=await table('ar_inbox'),by=id=>rows.find(x=>x.id===id);
 assert.equal(rows.length,5,'nothing deleted');
 assert.ok(by('normal').hidden_at,'a read message is cleared');
 assert.equal(by('unsure').hidden_at??null,null,'an unsure photo is not cleared');
 assert.ok(by('unread').hidden_at,'once re-read it is cleared like the rest');
 assert.equal(by('unread2').hidden_at??null,null,'a photo still not read is not cleared');
});
