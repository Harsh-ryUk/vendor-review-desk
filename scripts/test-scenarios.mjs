// Creates actual reviews only on a loopback development server.
import assert from 'node:assert/strict';
import {SCENARIOS,buildScenario,newSuiteId,scenarioFormData} from '../lib/scenarios.ts';
import {runReview} from '../lib/run-review.ts';
const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:5174';
if(!['127.0.0.1','localhost','[::1]'].includes(new URL(origin).hostname))throw new Error('Integration verification requires a local test database.');
const suite=newSuiteId(),results=[];
for(const scenario of SCENARIOS){
  const sample=buildScenario(scenario.id,suite),stages=[];
  const review=await runReview(scenarioFormData(sample),event=>{if(event.type==='stage'&&event.stage.state==='complete')stages.push(event.stage.id);},origin);
  assert.equal(review.status,scenario.expected,scenario.name);
  assert.equal(stages.length,6,`${scenario.id}: live stage events`);
  assert.equal(review.stages.length,6);
  assert.equal(review.sample.scenarioId,scenario.id);
  assert.equal(review.sample.suiteId,suite);
  assert.ok(review.checks.some(c=>c.id===scenario.check&&(scenario.expected==='approved'?c.state==='pass':c.state!=='pass')),scenario.id);
  assert.equal(JSON.stringify(review).includes(sample.input.account),false,'Full account number leaked');
  results.push(review);
  console.log(`${scenario.id}: ${review.status} · ${review.id}`);
}
const history=await(await fetch(`${origin}/api/reviews`)).json();
for(const review of results)assert.ok(history.reviews.some(r=>r.id===review.id&&r.sample?.suiteId===suite),'Sample not persisted');
const baseline=results.find(r=>r.sample.scenarioId==='clean');
for(const id of ['changed','duplicate','duplicate-incomplete'])assert.equal(results.find(r=>r.sample.scenarioId===id).relatedRunId,baseline.id);
console.log(`Verified ${results.length} actual submissions, six-stage streams, saved evidence, masked accounts, sample labels, and baseline links.`);
const oversize=scenarioFormData(buildScenario('missing',newSuiteId()));
oversize.set('bank',new File(['x'.repeat(2*1024*1024+1)],'too-large.txt'));
assert.equal((await fetch(`${origin}/api/reviews`,{method:'POST',body:oversize})).status,413);
const long=scenarioFormData(buildScenario('missing',newSuiteId()));long.set('legalName','x'.repeat(201));
assert.equal((await fetch(`${origin}/api/reviews`,{method:'POST',body:long})).status,400);
assert.equal((await fetch(`${origin}/api/reviews`,{method:'POST',body:'not multipart'})).status,400);
const unsupported=scenarioFormData(buildScenario('missing',newSuiteId()));unsupported.set('bank',new File(['not supported'],'bank.csv'));
assert.equal((await runReview(unsupported,()=>{},origin)).status,'pending');
const required=scenarioFormData(buildScenario('clean',newSuiteId()));required.delete('email');
const requiredResult=await runReview(required,()=>{},origin);assert.equal(requiredResult.status,'pending');assert.equal(requiredResult.checks.find(c=>c.id==='fields').state,'review');
const raceSeed=newSuiteId();
const races=await Promise.all([1,2].map(()=>runReview(scenarioFormData(buildScenario('clean',raceSeed)),()=>{},origin)));
assert.deepEqual(races.map(r=>r.status).sort(),['approved','rejected']);
console.log('Also verified size and length limits, malformed requests, unsupported files, missing required fields, and concurrent approval protection.');
