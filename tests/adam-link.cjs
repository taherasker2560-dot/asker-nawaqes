// «آدم» opens the bot with one command in the address (ar/adam.js): what is accepted and what is ignored.
const assert = require('node:assert/strict');
global.window = global;
const { parse, TABS } = require('../ar/adam.js') && global.AskerAdamLib;
assert.deepEqual(parse('go:sales'), { verb: 'go', arg: 'sales' });
assert.deepEqual(parse('go:customers'), { verb: 'go', arg: 'customers' });
assert.equal(parse('go:nowhere'), null, 'an unknown section');
assert.equal(parse('go:'), null);
assert.deepEqual(parse('cust:123'), { verb: 'cust', arg: '123' });
assert.equal(parse('cust:12a'), null);
assert.equal(parse('cust:1234567890123'), null);
assert.deepEqual(parse('find:بانادول إكسترا'), { verb: 'find', arg: 'بانادول إكسترا' });
assert.deepEqual(parse('find:  panadol  '), { verb: 'find', arg: 'panadol' });
assert.equal(parse('find:'), null);
assert.equal(parse('find:' + 'x'.repeat(81)), null);
assert.deepEqual(parse('theme:green'), { verb: 'theme', arg: 'green', night: '' });
assert.deepEqual(parse('theme:green:n'), { verb: 'theme', arg: 'green', night: 'n' });
assert.deepEqual(parse('theme:asker:d'), { verb: 'theme', arg: 'asker', night: 'd' });
assert.deepEqual(parse('theme:hex-1D6F48'), { verb: 'theme', arg: 'hex-1d6f48', night: '' });
assert.equal(parse('theme:hex-12345'), null, 'a short hex');
assert.equal(parse('theme:green:x'), null);
assert.equal(parse('theme:<script>'), null);
assert.deepEqual(parse('undo'), { verb: 'undo', arg: '' });
// nothing that writes anything exists here, and odd input is ignored
for (const bad of ['', null, undefined, 'send:123', 'stop:7', 'rpc:ar_x', 'go:sa\nles', 'go:sales\u0000', 'x'.repeat(200), ':::', 'javascript:alert(1)']) assert.equal(parse(bad), null, String(bad));
assert.ok(TABS.includes('sales') && TABS.includes('vendors') && TABS.includes('home'));
console.log('PASS: adam link: the commands the app may send, and nothing else');
