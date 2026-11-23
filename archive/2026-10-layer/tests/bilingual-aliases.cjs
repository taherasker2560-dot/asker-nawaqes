const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const html=fs.readFileSync('asker-nawaqes-test-10.html','utf8');
new Function(html.match(/<script>\s*([\s\S]*?)<\/script>/)[1]);
// Load the real matching code without a DOM, Supabase client or network access.
const normalizer=html.match(/function norm\(s\).*?\n/)[0];
const digits=html.match(/function asciiDigits\(s\).*?\n/)[0];
const aliases=html.slice(html.indexOf('const approvedBilingualAliases='),html.indexOf('function bestSuggestion('));
const ctx=vm.createContext({});vm.runInContext(normalizer+digits+aliases+';globalThis.find=approvedAliasSuggestion;',ctx);
const pairs=[
 ['زابيميرت ٣٠ مجم أقراص','ZAPIMERT 30MG TAB'],
 ['دونازيل ۵ مجم اقراص','DONAZIL 5MG 30TAB'],
 ['فالساتنس ١٦٠/٢٥ أقراص','VALSATENS PLUS 160/25 MG'],
 ['سبازموبينافير ٥٠ أقراص','SPASMOPINAVER 50MG 30TABL']
];
for(const [arabic,english] of pairs){
 const target={id:'existing-id',product_name:english,is_active:true};
 const result=ctx.find(arabic,[target]);assert.equal(result.item.id,target.id);assert.equal(result.kind,'approved_bilingual');
 assert.equal(ctx.find(arabic,[]),null);
 assert.equal(ctx.find(arabic,[{...target,is_active:false}]),null);
 assert.equal(ctx.find(arabic,[target,{...target,id:'ambiguous-id'}]),null);
}
assert.ok(ctx.find('زابيميرت30مجم اقراص',[{product_name:'zapimert 30 mg tablets'}]));
assert.equal(ctx.find('زابيميرت ١٥ مجم اقراص',[{product_name:pairs[0][1]}]),null);
assert.equal(ctx.find('دونازيل ٥ مجم شراب',[{product_name:pairs[1][1]}]),null);
assert.equal(ctx.find('فالساتنس ١٦٠/١٢٫٥ اقراص',[{product_name:pairs[2][1]}]),null);
assert.equal(ctx.find('دونازيل ٥ مجم اقراص',[{product_name:'DONAZIL 5MG 10TAB'}]),null);
assert.equal(ctx.find('دونازيل ٥ مجم اقراص',[{product_name:'DONAZIL 5MG SYR'}]),null);
// Check the actual save handler: alias results must enter the possible branch only.
assert.match(html,/if\(suggestion\)return \{[^}]*match_status:'possible'/);
assert.ok(html.includes("suggestion.kind==='approved_bilingual'"));
console.log('PASS: four approved pairs, digit/spacing variants, missing/inactive/ambiguous targets, strength/form/pack guards, pending-confirmation save path and JS syntax');
