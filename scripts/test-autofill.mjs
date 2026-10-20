import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildScenario} from '../lib/scenarios.ts';
const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:5175';
if(!['127.0.0.1','localhost','[::1]'].includes(new URL(origin).hostname))throw new Error('Use an isolated local server for autofill verification.');
const history=async()=> (await (await fetch(`${origin}/api/reviews`)).json()).reviews.map(r=>r.id);
const before=await history();
async function request(file,role='profile') {
  const form=new FormData();if(file)form.set('file',file);form.set('role',role);
  const response=await fetch(`${origin}/api/autofill`,{method:'POST',body:form});
  assert.equal(response.headers.get('cache-control'),'no-store');
  return {response,data:await response.json()};
}
const example=await readFile(new URL('../public/samples/vendor-details.txt',import.meta.url));
const full=await request(new File([example],'details.txt'));
assert.equal(full.response.status,200);assert.equal(Object.keys(full.data.fields).length,7);assert.equal(full.data.fields.country,'IN');
const sample=buildScenario('clean','api-import');
for(const kind of ['tax','bank']) {
  const doc=sample[kind],result=await request(new File([doc.content],doc.name),kind);
  assert.equal(result.response.status,200);assert.equal(result.data.pages,1);
  const key=kind==='tax'?'taxId':'account';assert.equal(result.data.fields[key],sample.input[key]);
  if(kind==='bank') assert.equal(result.data.fields.legalName,undefined);
}
const json=await request(new File([JSON.stringify(sample.input)],'details.json'));
assert.equal(json.response.status,200);assert.equal(json.data.fields.email,sample.input.email);
const conflict=await request(new File(['Company name: First\nCompany name: Second\nIFSC: HDFC0001234'],'conflict.txt'));
assert.equal(conflict.data.fields.legalName,undefined);assert.ok(conflict.data.warnings.length);assert.equal(conflict.data.fields.bankCode,'HDFC0001234');
for(const id of ['no-text','page-limit','malformed-pdf']) {
  const s=buildScenario(id,'api-import'),doc=id==='page-limit'?s.tax:s.bank;
  assert.equal((await request(new File([doc.content],doc.name))).response.status,422,id);
}
assert.equal((await request(new File(['x'],'wrong.csv'))).response.status,415);
assert.equal((await request(new File(['x'.repeat(2*1024*1024+1)],'large.txt'))).response.status,413);
assert.equal((await request(new File(['x'.repeat(80001)],'long.txt'))).response.status,422);
assert.equal((await request(new File(['{bad'],'bad.json'))).response.status,422);
assert.equal((await request(null)).response.status,400);
assert.equal((await request(new File(['Company name: First'],'valid.txt'),'invalid')).response.status,400);
assert.equal((await fetch(`${origin}/api/autofill`,{method:'POST',body:'bad'})).status,400);
assert.deepEqual(await history(),before,'Autofill must not create reviews or change the registry.');
console.log('Verified complete TXT/JSON imports, real PDF proofs, conflicting fields, no-store responses, upload/text/page limits, malformed and unreadable files, and no review creation.');
