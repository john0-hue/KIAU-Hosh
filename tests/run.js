import * as matching from '../lib/matching.js';
import * as messages from '../lib/messages.js';

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { failed++; console.log('  ✗ ' + name + '\n    ' + err.message); }
}
function assert(condition, msg) { if (!condition) throw new Error(msg || 'Assertion failed'); }
function eq(a,b,msg) { if (a !== b) throw new Error(msg || `Expected ${JSON.stringify(b)} but got ${JSON.stringify(a)}`); }

console.log('\n=== Matching Tests ===');
test('normalizeText - trimming', () => eq(matching.normalizeText('  hello  '), 'hello'));
test('normalizeText - whitespace', () => eq(matching.normalizeText('hello   world'), 'hello world'));
test('normalizeText - Persian ye', () => eq(matching.normalizeText('ریاضی'), matching.normalizeText('ریاضي')));
test('normalizeText - Persian kaf', () => eq(matching.normalizeText('کامپیوتر'), matching.normalizeText('كامپيوتر')));
test('normalizeText - ZWNJ', () => eq(matching.normalizeText('می‌خواهم'), matching.normalizeText('میخواهم')));
test('normalizeText - digits', () => eq(matching.normalizeText('۱۴۰۵'), matching.normalizeText('1405')));
test('normalizeUrl - keeps arbitrary HTTPS host', () => eq(matching.normalizeUrl('https://example.invalid/course/'), 'https://example.invalid/course'));
test('levenshtein', () => eq(matching.levenshtein('hello','helo'),1));
test('similarity identical', () => eq(matching.similarityRatio('abc','abc'),0));

console.log('\n=== Message Tests ===');
test('derivePlatform - telegram', () => eq(messages.derivePlatform('https://t.me/joinchat/abc'),'تلگرام'));
test('derivePlatform - whatsapp', () => eq(messages.derivePlatform('https://wa.me/12345'),'واتساپ'));
test('escapeHtml', () => eq(messages.escapeHtml('<b>test</b>'),'&lt;b&gt;test&lt;/b&gt;'));


console.log(`\nTests: ${passed + failed} total, ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
