// Installable app: manifest, icons and the WhatsApp share target are served.
const {run,assert}=require('./harness.cjs');
run('manifest, icons and share target',async({page})=>{
 const m=await page.evaluate(async()=>{const r=await fetch(document.querySelector('link[rel=manifest]').href);const j=await r.json();const icons=[];for(const i of j.icons)icons.push((await fetch(new URL(i.src,r.url))).ok);return {j,icons}});
 assert.equal(m.j.short_name,'نواقص عربي');assert.equal(m.j.display,'standalone');assert.deepEqual(m.icons,[true,true,true,true]);
 // the round logo (2026-11-12): plain icons for the browser, padded ones for the phone's icon shape
 assert.deepEqual(m.j.icons.map(i=>i.purpose),['any','any','maskable','maskable']);
 assert.equal(m.j.share_target.action,'ar/share');assert.equal(m.j.share_target.method,'POST');
});
