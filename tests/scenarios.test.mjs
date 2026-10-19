import test from 'node:test';
import assert from 'node:assert/strict';
import {SCENARIOS,buildScenario,newSuiteId} from '../lib/scenarios.ts';
import {extractDocument} from '../lib/extract.ts';
import {intakeChecks,documentChecks,registrationChecks,bankingChecks,registryCheck,decision,accountFingerprint,normalizeTax} from '../lib/review.ts';

test('all 26 sample submissions extract and produce their documented outcome and reason',async()=>{
  assert.equal(SCENARIOS.length,26);
  const registry=new Map(),seed=newSuiteId();
  for(const scenario of SCENARIOS){
    const sample=buildScenario(scenario.id,seed), evidence=[];
    for(const kind of ['tax','bank']){const doc=sample[kind];if(doc)evidence.push(await extractDocument(new File([doc.content],doc.name,{type:doc.type}),kind));}
    const key=await accountFingerprint(sample.input.account);
    const checks=[...intakeChecks(sample.input),...documentChecks(evidence),...registrationChecks(sample.input,evidence),...bankingChecks(sample.input,evidence),registryCheck(sample.input,key,registry.get(normalizeTax(sample.input.taxId))||null)];
    assert.equal(decision(checks),scenario.expected,`${scenario.id}: ${JSON.stringify(checks.filter(c=>c.state!=='pass'))}`);
    assert.ok(checks.find(c=>c.id===scenario.check&&(scenario.expected==='approved'?c.state==='pass':c.state!=='pass')),`${scenario.id}: expected check ${scenario.check}`);
    if(scenario.expected==='approved')registry.set(sample.input.taxId,{taxId:sample.input.taxId,legalName:sample.input.legalName,bankCode:sample.input.bankCode,accountKey:key,runId:`VR-${scenario.id}`});
  }
  assert.equal(registry.size,2);
});

test('sample batches use fresh identifiers while retaining their own baseline relationships',()=>{
  const one=buildScenario('clean','batch-one'),two=buildScenario('clean','batch-two');
  assert.notEqual(one.input.taxId,two.input.taxId);
  for(const id of ['changed','duplicate','duplicate-incomplete'])assert.equal(buildScenario(id,'batch-one').input.taxId,one.input.taxId);
  assert.throws(()=>buildScenario('unknown','batch-one'));
});
