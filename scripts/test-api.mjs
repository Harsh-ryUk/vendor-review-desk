// Run against a disposable local preview database; this creates real test reviews.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gstCheckDigit } from '../lib/review.ts';
const origin=process.env.TEST_ORIGIN || 'http://127.0.0.1:5173';
const fixtures=JSON.parse(await readFile(new URL('../public/samples/submissions.json', import.meta.url)));
async function run(input,documents) {
  const form=new FormData();
  for(const [key,value] of Object.entries(input)) form.set(key,value);
  for(const [kind,file] of Object.entries(documents)) {
    const bytes=await readFile(new URL(`../public/samples/${file}`,import.meta.url));
    form.set(kind,new File([bytes],file,{type:'application/pdf'}));
  }
  const response=await fetch(`${origin}/api/reviews`,{method:'POST',body:form});
  assert.equal(response.status,200);
  const events=(await response.text()).trim().split('\n').map(JSON.parse);
  assert.equal(events.some(e=>e.type==='error'),false,JSON.stringify(events.at(-1)));
  const completed=events.find(e=>e.type==='complete'); assert.ok(completed);
  assert.equal(events.filter(e=>e.type==='stage' && e.stage.state==='complete').length,6);
  const raw=JSON.stringify(completed.review);
  assert.equal(raw.includes(input.account),false,'Saved response leaked a full account number');
  return completed.review;
}
const northstar=fixtures.northstar;
// Northstar may already be approved by a browser test; duplicate is therefore expected here.
const first=await run(northstar,{tax:'northstar-registration.pdf',bank:'northstar-bank.pdf'});
assert.ok(['approved','rejected'].includes(first.status));
console.log(`Clean/repeat submission: ${first.status}`);
const missing=await run(fixtures.willow,{tax:'willow-registration.pdf'});
assert.equal(missing.status,'pending'); assert.ok(missing.response.includes('Upload the bank account proof'));
console.log('Missing proof: pending with requested document');
const conflict=await run(fixtures.cedar,{tax:'cedar-registration.pdf',bank:'cedar-bank.pdf'});
assert.equal(conflict.status,'pending'); assert.equal(conflict.checks.find(c=>c.id==='bank-holder').state,'review');
console.log('Account holder conflict: pending with evidence');
const change=await run({...northstar,account:'908070605432'},{tax:'northstar-registration.pdf',bank:'northstar-changed-bank.pdf'});
assert.equal(change.status,'pending'); assert.ok(change.checks.find(c=>c.id==='bank-change'));
console.log('Changed bank: pending, linked to approved record');
const duplicate=await run(northstar,{tax:'northstar-registration.pdf',bank:'northstar-bank.pdf'});
assert.equal(duplicate.status,'rejected'); assert.ok(duplicate.relatedRunId);
console.log('Duplicate: rejected, original banking retained');
const history=await (await fetch(`${origin}/api/reviews`)).json();
assert.ok(history.reviews.some(r=>r.id===missing.id)); assert.ok(history.reviews.some(r=>r.id===change.id));
assert.equal(history.reviews.find(r=>r.id===change.id).stages.length,6);
console.log('Persisted history and all six stage events verified');
const bad=await fetch(`${origin}/api/reviews`,{method:'POST',body:'invalid'}); assert.equal(bad.status,400);
console.log('Invalid request: HTTP 400');
// Two simultaneous clean submissions must never approve the same new GSTIN twice.
const prefix='29AAACR' + String(Date.now() % 10000).padStart(4,'0') + 'A1Z';
const racing={...northstar,legalName:'Race Test Private Limited',taxId:prefix+gstCheckDigit(prefix)};
async function race() {
  const form=new FormData();
  for(const [key,value] of Object.entries(racing)) form.set(key,value);
  form.set('tax',new File([JSON.stringify({legalName:racing.legalName,taxId:racing.taxId})],'registration.json'));
  form.set('bank',new File([JSON.stringify({legalName:racing.legalName,account:racing.account,bankCode:racing.bankCode})],'bank.json'));
  const response=await fetch(`${origin}/api/reviews`,{method:'POST',body:form});
  const events=(await response.text()).trim().split('\n').map(JSON.parse);
  const completed=events.find(e=>e.type==='complete'); assert.ok(completed,JSON.stringify(events.at(-1)));
  return completed.review.status;
}
const raced=await Promise.all([race(),race()]);
assert.deepEqual(raced.sort(),['approved','rejected']);
console.log('Concurrent submissions: one approved, one duplicate; registry uniqueness preserved');
