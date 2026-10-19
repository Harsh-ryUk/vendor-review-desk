import test from 'node:test';
import assert from 'node:assert/strict';
import {policyChecks,POLICY_REFERENCES} from '../lib/vendor-policy.ts';
import {buildScenario} from '../lib/scenarios.ts';
import {decision,explain,documentChecks,validTax} from '../lib/review.ts';

function identity(id='blocked-vendor') {
  const {input}=buildScenario(id,'policy-test');
  return {input,evidence:[{kind:'tax',fileName:'registration.json',format:'JSON',pages:0,fields:{legalName:input.legalName,taxId:input.taxId}}]};
}
test('restrictions and revocation require a full identity match to a valid reference',()=>{
  for(const id of ['blocked-vendor','revoked-registration']) {
    const {input,evidence}=identity(id);
    const checks=policyChecks(input,evidence);
    assert.ok(validTax(input.taxId));
    assert.equal(decision(checks),'rejected');
    assert.ok(checks.some(c=>c.state==='fail'&&c.terminal&&c.source.includes('Fictional')));
    for(const changes of [{legalName:'Unrelated Private Limited'},{country:'US'}]) {
      assert.equal(policyChecks({...input,...changes},evidence).some(c=>c.terminal),false);
    }
    assert.equal(policyChecks(input,[]).some(c=>c.terminal),false);
    assert.equal(decision(policyChecks(input,[])),'pending');
    assert.equal(policyChecks(input,[{...evidence[0],error:'Conflicting fields'}]).some(c=>c.terminal),false);
  }
});
test('similar names and unlisted identifiers do not trigger a restriction',()=>{
  const {input,evidence}=identity();
  const clean=buildScenario('clean','unlisted').input;
  assert.ok(policyChecks({...input,taxId:clean.taxId},evidence).every(c=>c.state==='pass'));
  const varied={...input,legalName:input.legalName.toLowerCase().replace('private limited','pvt. ltd.')};
  assert.equal(decision(policyChecks(varied,evidence)),'rejected');
  assert.equal(POLICY_REFERENCES.length,2);
});
test('confirmed restriction outranks missing bank proof and its response names the actual remedy',()=>{
  const {input,evidence}=identity();
  const checks=[...documentChecks(evidence),...policyChecks(input,evidence)];
  assert.equal(checks.find(c=>c.id==='doc-bank').state,'review');
  assert.equal(decision(checks),'rejected');
  const result=explain(input,checks,'rejected','VR-POLICY');
  assert.match(result.summary,/Internal vendor restriction/);
  assert.match(result.response,/DEMO-BLOCK-001/);
  assert.doesNotMatch(result.response,/Upload the bank account proof|already exists/);
});
test('category policy rejects the excluded category, reviews unknown values, and defaults older submissions',()=>{
  const input=buildScenario('clean','category-test').input;
  assert.equal(decision(policyChecks({...input,serviceCategory:'gambling'},[])),'rejected');
  assert.equal(decision(policyChecks({...input,serviceCategory:'invented'},[])),'pending');
  assert.equal(decision(policyChecks(input,[])),'approved');
  const checks=policyChecks({...input,serviceCategory:'gambling'},[]);
  assert.match(explain(input,checks,'rejected','VR-CATEGORY').response,/CATEGORY-001|Gambling services/);
});
