// «آدم» opening the bot (ar/adam.js): a section, the search on top, the color and «رجّعه», all from the address; a command that is
// not on the list does nothing. Made-up data only.
const {run,assert}=require('./harness.cjs');
run('Adam: the address opens a section, the search, the color, and gives the color back',async({page,base})=>{
 const url=(cmd)=>base+'asker-nawaqes-arabic.html?adam='+encodeURIComponent(cmd);
 const ready=()=>page.waitForFunction(()=>window.__tables&&/\d/.test(document.getElementById('shStats')?.textContent||''));
 const visible=(id)=>page.evaluate(id=>!document.getElementById(id).classList.contains('hidden'),id);
 // a section
 await page.goto(url('go:expiry'));await ready();
 await page.waitForFunction(()=>!document.getElementById('expiryPanel').classList.contains('hidden'),null,{timeout:8000});
 assert.ok(await visible('expiryPanel'));
 assert.equal(await page.evaluate(()=>location.search),'','the command leaves the address');
 // the search on top
 await page.goto(url('find:FLAGYL'));await ready();
 await page.waitForFunction(()=>document.getElementById('hsQ').value==='FLAGYL',null,{timeout:8000});
 assert.ok(await visible('homePanel'));
 // the color: a ready color, then «رجّعه» from the line at the bottom
 const accent=()=>page.evaluate(()=>[localStorage.getItem('asker-accent'),getComputedStyle(document.documentElement).getPropertyValue('--crimson').trim()]);
 const before=await accent();
 await page.goto(url('theme:emerald'));await ready();
 await page.waitForFunction(()=>localStorage.getItem('asker-accent')==='emerald',null,{timeout:8000});
 const green=await accent();assert.notEqual(green[1],before[1],'the page color changed');
 await page.waitForFunction(()=>document.getElementById('adamToast')&&/آدم غيّر اللون/.test(document.getElementById('adamToast').textContent));
 await page.click('#adamToast button');
 await page.waitForFunction(b=>getComputedStyle(document.documentElement).getPropertyValue('--crimson').trim()===b,before[1],{timeout:5000});
 assert.equal((await accent())[1],before[1],'«رجّعه» gives the old color back');
 // night look from the address, and any color
 await page.goto(url('theme:hex-b3261e:n'));await ready();
 await page.waitForFunction(()=>localStorage.getItem('asker-accent')==='c:#b3261e'&&document.documentElement.classList.contains('night'),null,{timeout:8000});
 // a command that is not on the list does nothing
 const marker=await page.evaluate(()=>localStorage.getItem('asker-accent'));
 await page.goto(url('rpc:ar_adam_do'));await ready();await page.waitForTimeout(900);
 assert.equal(await page.evaluate(()=>localStorage.getItem('asker-accent')),marker);
});
