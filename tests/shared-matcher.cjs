// Keeps the moving parts in step:
// 1. Both bots deploy their own copy of the matcher (Supabase deploys each function folder on its own): the copies
//    must be identical, so a fix can never land in one bot only.
// 2. The trial page states the server version it expects (SERVER_VERSION in ar/app.js); it must equal VERSION in
//    the function, so a page change that needs a new function cannot be merged without bumping both, and the page
//    warns the owner when the deployed function is older than the page.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const read=(...p)=>fs.readFileSync(path.join(__dirname,'..',...p),'utf8');
const f=n=>read('supabase','functions',n,'match.ts');
assert.equal(f('arabic-shortages'),f('read-supplier-image'),'supabase/functions/*/match.ts must be identical: copy the changed one over the other');
const server=read('supabase','functions','arabic-shortages','index.ts').match(/export const VERSION = '([^']+)'/)[1];
const page=read('ar','app.js').match(/SERVER_VERSION = '([^']+)'/)[1];
assert.equal(page,server,'ar/app.js SERVER_VERSION must equal the function VERSION');
console.log('PASS: shared-matcher: same match.ts in both bots; page expects server '+server);
