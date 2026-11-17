// «حساب الموقع» (store/siteuser.js, owner 2026-11-17): the checks before the server is asked, the platform name, every server error has its words.
const assert=require('node:assert/strict');
const U=require('../store/siteuser.js');
// signing up: a tidy name, the mobile in one form, a password of 6+ (and at most 72 bytes, like the server)
let r=U.check({name:'  أحمد   محمود ',phone:'+20 10 1234 5678',password:'secret1'});
assert.deepEqual(r,{ok:true,name:'أحمد محمود',phone:'01012345678',password:'secret1'});
assert.equal(U.check({name:'أ',phone:'01012345678',password:'secret1'}).error,'bad_name');
assert.equal(U.check({name:'',phone:'01012345678',password:'secret1'}).error,'bad_name');
assert.equal(U.check({name:'أحمد',phone:'01312345678',password:'secret1'}).error,'bad_phone');
assert.equal(U.check({name:'أحمد',phone:'',password:'secret1'}).error,'bad_phone');
assert.equal(U.check({name:'أحمد',phone:'01012345678',password:'12345'}).error,'bad_password');
assert.equal(U.check({name:'أحمد',phone:'01012345678',password:''}).error,'bad_password');
assert.equal(U.check({name:'أحمد',phone:'01012345678',password:'ا'.repeat(37)}).error,'bad_password','74 bytes: too long for bcrypt');
assert.equal(U.check({name:'أحمد',phone:'01012345678',password:'ا'.repeat(36)}).ok,true,'72 bytes is the limit');
assert.equal(U.check({name:'أحمد',phone:'٠١٠١٢٣٤٥٦٧٨',password:'secret1'}).phone,'01012345678','Arabic digits');
assert.equal(U.check({name:'x'.repeat(100),phone:'01012345678',password:'secret1'}).name.length,60);
// signing in does not need a name
assert.equal(U.check({mode:'login',name:'',phone:'01012345678',password:'secret1'}).ok,true);
assert.equal(U.check({mode:'login',phone:'0101',password:'secret1'}).error,'bad_phone');
// the platform the bot counts
const UA={ios:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',android:'Mozilla/5.0 (Linux; Android 14; SM-A566B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',pc:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'};
assert.equal(U.platformOf(UA.ios,'iPhone',5),'ios');
assert.equal(U.platformOf(UA.android,'Linux armv81',5),'android');
assert.equal(U.platformOf(UA.pc,'Win32',0),'desktop');
assert.equal(U.platformOf('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15','MacIntel',5),'ios','an iPad that says it is a Mac');
// every error the server can answer has Arabic words (the page never shows a code)
const fs=require('node:fs');
const sql=fs.readFileSync('supabase/migrations/202611170300_ar_site_users.sql','utf8');
const codes=new Set([...sql.matchAll(/'error', '([a-z_]+)'/g)].map(m=>m[1]));
for(const c of ['bad_name','bad_phone','bad_password','exists','bad','locked','busy'])assert.ok(codes.has(c),'the server says '+c);
for(const c of codes){if(['session','no_user'].includes(c))continue;assert.ok(U.ERRORS[c]&&/[؀-ۿ]/.test(U.ERRORS[c]),'words for '+c)}
assert.ok(U.ERRORS.down);
console.log('site-user ok');
