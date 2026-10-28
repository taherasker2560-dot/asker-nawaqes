// Browser test harness for the trial bot (asker-nawaqes-arabic.html).
// Serves the repository on http://localhost:<port> (service workers need localhost), replaces supabase-js with the
// in-memory fake in fake-supabase-ar.js (no real Supabase, Gemini or WhatsApp is ever called) and blocks every
// other outside request. A test fails if the page throws.
const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const repo=path.resolve(__dirname,'..','..'),FAKE=path.join(__dirname,'fake-supabase-ar.js'),FIX=path.join(__dirname,'fixtures');
const TYPES={'.html':'text/html; charset=utf-8','.js':'application/javascript','.json':'application/json','.png':'image/png','.css':'text/css','.svg':'image/svg+xml'};
function serve(){return new Promise(ok=>{const srv=http.createServer((q,r)=>{const u=new URL(q.url,'http://x');const f=path.join(repo,decodeURIComponent(u.pathname));
  if(q.method==='GET'&&f.startsWith(repo)&&fs.existsSync(f)&&fs.statSync(f).isFile()){r.writeHead(200,{'content-type':TYPES[path.extname(f)]||'application/octet-stream'});return r.end(fs.readFileSync(f))}
  r.writeHead(404);r.end()});srv.listen(0,'127.0.0.1',()=>ok(srv))})}
// runs one after the other; any failure sets a failing exit code
let queue=Promise.resolve();
function run(name,fn,opts){queue=queue.then(()=>runOne(name,fn,opts)).catch(e=>{console.error('FAIL: '+name+'\n',e);process.exitCode=1});return queue}
async function runOne(name,fn,{permissions=[]}={}){const srv=await serve(),base=`http://localhost:${srv.address().port}/`;
 const browser=await chromium.launch();const errs=[];
 try{const ctx=await browser.newContext({viewport:{width:412,height:915},permissions});
  await ctx.route(/^https?:\/\//,route=>{const u=new URL(route.request().url());
   if(u.hostname==='cdn.jsdelivr.net'&&u.pathname.includes('supabase'))return route.fulfill({contentType:'application/javascript',body:fs.readFileSync(FAKE)});
   if(u.hostname==='localhost')return route.continue();return route.abort()});
  const page=await ctx.newPage();page.on('pageerror',e=>errs.push(e.message));
  await page.goto(base+'asker-nawaqes-arabic.html');await page.waitForFunction(()=>window.__tables&&/\d/.test(document.getElementById('shStats')?.textContent||''));
  await fn({page,base,fixture:n=>path.join(FIX,n),table:t=>page.evaluate(t=>JSON.parse(JSON.stringify(window.__tables[t]||[])),t)});
  assert.deepEqual(errs,[],'no page errors');console.log('PASS: '+name)}
 finally{await browser.close();srv.close()}}
const text=async(page,sel)=>(await page.textContent(sel)).replace(/\s+/g,' ').trim();
const waitStatus=(page,re,id='readStatus')=>page.waitForFunction(([id,src])=>new RegExp(src).test(document.getElementById(id)?.textContent||''),[id,re.source],{timeout:20000});
module.exports={run,text,waitStatus,assert};
