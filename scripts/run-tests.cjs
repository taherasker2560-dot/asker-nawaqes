// Runs every test as its own Node process and prints one line per file. `node scripts/run-tests.cjs [unit|e2e]`.
// Unit tests: tests/*.cjs. Browser tests: tests/e2e/*.spec.cjs (need Playwright's Chromium).
const {spawnSync}=require('node:child_process'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),which=process.argv[2]||'all';
const list=(dir,re)=>fs.readdirSync(path.join(root,dir)).filter(f=>re.test(f)).sort().map(f=>path.join(dir,f));
const files=[...(which!=='e2e'?list('tests',/\.cjs$/):[]),...(which!=='unit'?list('tests/e2e',/\.spec\.cjs$/):[])];
let failed=0;
for(const f of files){const t0=Date.now(),r=spawnSync(process.execPath,[f],{cwd:root,encoding:'utf8',timeout:180000});
 const ok=r.status===0;if(!ok)failed++;console.log(`${ok?'ok  ':'FAIL'} ${f} (${Date.now()-t0} ms)`);
 if(!ok)console.log(((r.stdout||'')+(r.stderr||'')).split('\n').slice(-25).join('\n'))}
console.log(`\n${files.length-failed} passed, ${failed} failed`);process.exit(failed?1:0);
