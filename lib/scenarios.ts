import { gstCheckDigit, type Status, type Submission } from './review.ts';

export type Scenario = { id: string; name: string; company: string; category: string; expected: Status; description: string; check: string; baseline?: boolean };
export const SCENARIOS: Scenario[] = [
  {id:'clean',name:'Everything matches',company:'Northstar Studio',category:'Core demo',expected:'approved',check:'registry',description:'Readable registration and bank PDFs agree with the submission.'},
  {id:'missing',name:'Missing bank proof',company:'Willow Works',category:'Core demo',expected:'pending',check:'doc-bank',description:'Registration is complete, but the required bank proof is absent.'},
  {id:'mismatch',name:'Different account holder',company:'Cedar Supply',category:'Core demo',expected:'pending',check:'bank-holder',description:'The bank account belongs to Cedar Logistics, not the submitted company.'},
  {id:'changed',name:'Existing vendor, new account',company:'Northstar Studio',category:'Core demo',expected:'pending',check:'bank-change',baseline:true,description:'Banking differs from the approved baseline. Retain the original record.'},
  {id:'duplicate',name:'Identical repeat submission',company:'Northstar Studio',category:'Registry',expected:'rejected',check:'duplicate',baseline:true,description:'Company, GSTIN, and bank details match an existing approved vendor.'},
  {id:'duplicate-incomplete',name:'Duplicate with missing evidence',company:'Northstar Studio',category:'Registry',expected:'pending',check:'doc-bank',baseline:true,description:'Missing proof takes precedence over a duplicate match; request evidence first.'},
  {id:'missing-tax',name:'Missing registration',company:'Maple Services',category:'Documents',expected:'pending',check:'doc-tax',description:'Bank proof is present but the registration certificate is missing.'},
  {id:'missing-both',name:'No supporting documents',company:'Birch Partners',category:'Documents',expected:'pending',check:'doc-bank',description:'A complete form cannot substitute for the two required documents.'},
  {id:'invalid-tax',name:'Invalid GSTIN checksum',company:'Orchid Supplies',category:'Registration',expected:'pending',check:'tax-format',description:'The form and certificate agree, but their tax identifier fails its checksum.'},
  {id:'tax-mismatch',name:'Certificate GSTIN differs',company:'Juniper Works',category:'Registration',expected:'pending',check:'registration-tax',description:'A valid identifier on the form differs from the certificate identifier.'},
  {id:'name-mismatch',name:'Different registered company',company:'Aspen Trading',category:'Registration',expected:'pending',check:'registration-name',description:'The registration names another company. Similar-looking names are not approved.'},
  {id:'normalized',name:'Pvt. Ltd. name variation',company:'Oakline Services',category:'Registration',expected:'approved',check:'registration-name',description:'Case, punctuation, and legal abbreviations normalize to the same company.'},
  {id:'account-mismatch',name:'Same last four, different account',company:'Harbor Logistics',category:'Banking',expected:'pending',check:'bank-account',description:'Masked endings look identical, but comparison of full account numbers finds a mismatch.'},
  {id:'ifsc-mismatch',name:'Bank branch code mismatch',company:'Meadow Supplies',category:'Banking',expected:'pending',check:'bank-code',description:'Two structurally valid IFSC codes disagree between form and proof.'},
  {id:'invalid-banking',name:'Invalid account and IFSC',company:'Pinecrest Goods',category:'Banking',expected:'pending',check:'bank-format',description:'The evidence agrees with the form, but the account is too short and IFSC is malformed.'},
  {id:'expired',name:'Expired registration and bank proof',company:'Riverbend Labs',category:'Documents',expected:'pending',check:'expiry-tax',description:'Both documents state an expiry date in the past. Request current proof.'},
  {id:'invalid-expiry',name:'Impossible expiry date',company:'Summit Materials',category:'Documents',expected:'pending',check:'expiry-bank',description:'The bank proof says 2099-02-30. A future-looking date still must be a real date.'},
  {id:'conflicting',name:'Two account numbers in one file',company:'Brookfield Studio',category:'Documents',expected:'pending',check:'doc-bank',description:'Repeated labels conflict. Extraction stops instead of choosing one account.'},
  {id:'unlabelled',name:'Unlabelled bank information',company:'Elmwood Retail',category:'Documents',expected:'pending',check:'doc-bank',description:'A paragraph mentions bank details without supported labels. No values are guessed.'},
  {id:'invalid-json',name:'Broken JSON document',company:'Coastline Design',category:'Documents',expected:'pending',check:'doc-tax',description:'The registration JSON is malformed. Save an explained manual-review outcome.'},
  {id:'json-types',name:'Numeric account in JSON',company:'Foxglove Foods',category:'Documents',expected:'pending',check:'doc-bank',description:'The bank document uses a number instead of a string, risking loss of leading zeros.'},
  {id:'incomplete-doc',name:'Certificate missing its GSTIN',company:'Westhaven Supply',category:'Documents',expected:'pending',check:'doc-tax',description:'A readable registration file lacks the required labelled tax identifier.'},
  {id:'no-text',name:'PDF without a readable text layer',company:'Clearwater Works',category:'File handling',expected:'pending',check:'doc-bank',description:'A real PDF contains only vector artwork. Like a scan without OCR, no fields can be extracted.'},
  {id:'malformed-pdf',name:'Damaged PDF upload',company:'Stonebridge Tools',category:'File handling',expected:'pending',check:'doc-bank',description:'A file named PDF is not a valid PDF. The run records the extraction error.'},
  {id:'page-limit',name:'PDF exceeds ten pages',company:'Silverleaf Systems',category:'File handling',expected:'pending',check:'doc-tax',description:'An eleven-page PDF exceeds the bounded extraction policy and needs review.'},
  {id:'country',name:'Country outside current policy',company:'Redwood Export',category:'Registration',expected:'pending',check:'country',description:'A US submission is explicitly held for manual review under the India-only policy.'},
];
export const CATEGORIES = ['All cases', ...new Set(SCENARIOS.map(s => s.category))];
export type DemoDocument = {name: string; content: string; type: string};
export type DemoSubmission = {input: Submission; tax: DemoDocument | null; bank: DemoDocument | null; scenarioId: string; suiteId: string};
export function newSuiteId() { return crypto.randomUUID().replaceAll('-', '').slice(0, 12); }

function identifier(seed: string, index: number) {
  let hash = 2166136261;
  for (const c of seed) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619) >>> 0;
  const value = (hash + index * 7919) % 6760000;
  const letters = String.fromCharCode(65 + Math.floor(value / 260000), 65 + Math.floor(value / 10000) % 26);
  const prefix = `29AAA${letters}${String(value % 10000).padStart(4,'0')}A1Z`;
  return prefix + gstCheckDigit(prefix);
}

// Small, valid ASCII PDFs keep every fixture inspectable and dependency-free.
function pdf(lines: string[], pages = 1) {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', `<< /Type /Pages /Kids [${Array.from({length:pages},(_,i)=>`${4+i*2} 0 R`).join(' ')}] /Count ${pages} >>`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  for (let i=0;i<pages;i++) {
    const escape = (s:string) => s.replaceAll('\\','\\\\').replaceAll('(','\\(').replaceAll(')','\\)');
    const stream = lines.length ? `BT /F1 11 Tf 45 790 Td ${['FICTIONAL SAMPLE - NOT A REAL CERTIFICATE', ...lines].map((line,j)=>`${j ? '0 -28 Td ' : ''}(${escape(line)}) Tj`).join('\n')} ET` : '0.85 g 45 500 400 200 re f';
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5+i*2} 0 R >>`, `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  }
  let output = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((object,i)=>{offsets.push(output.length);output += `${i+1} 0 obj\n${object}\nendobj\n`;});
  const xref = output.length;
  output += `xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.slice(1).map(n=>`${String(n).padStart(10,'0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return output;
}
export function buildScenario(id: string, suiteId: string): DemoSubmission {
  const sample = SCENARIOS.find(s=>s.id===id);
  if (!sample || !/^[a-zA-Z0-9-]{1,40}$/.test(suiteId)) throw new Error('Unknown sample scenario or invalid sample batch.');
  const index = SCENARIOS.indexOf(sample);
  const baseline = sample.baseline || id==='clean';
  const company = baseline ? 'Northstar Studio' : sample.company;
  const input: Submission = {legalName:`${company} Sample ${suiteId.slice(0,6)} Private Limited`,email:`demo-${id}@vendor.example`,country:'IN',taxId:identifier(suiteId,baseline?0:index),account:'102030405678',bankCode:'HDFC0001234'};
  if (id==='changed') input.account='908070605432';
  if (id==='invalid-tax') input.taxId=input.taxId.slice(0,14)+(input.taxId[14]==='0'?'1':'0');
  if (id==='invalid-banking') {input.account='12345';input.bankCode='HDFC123';}
  if (id==='country') input.country='US';
  const taxFields: Record<string,string> = {legalName:input.legalName,taxId:input.taxId};
  const bankFields: Record<string,string> = {legalName:input.legalName,account:input.account,bankCode:input.bankCode};
  if (id==='mismatch') bankFields.legalName='Cedar Logistics Private Limited';
  if (id==='tax-mismatch') taxFields.taxId=identifier(suiteId,index+100);
  if (id==='name-mismatch') taxFields.legalName='Aspen Holdings Private Limited';
  if (id==='normalized') {taxFields.legalName=input.legalName.toLowerCase().replace('private limited','pvt. ltd.');bankFields.legalName=taxFields.legalName;}
  if (id==='account-mismatch') bankFields.account='998877665678';
  if (id==='ifsc-mismatch') bankFields.bankCode='ICIC0001234';
  if (id==='expired') {taxFields.validUntil='2020-01-01';bankFields.validUntil='2020-01-01';}
  if (id==='invalid-expiry') bankFields.validUntil='2099-02-30';
  if (id==='incomplete-doc') delete taxFields.taxId;
  const labels: Record<string,string> = {legalName:'Company name',taxId:'GSTIN',account:'Account number',bankCode:'IFSC',validUntil:'Valid until'};
  const lines = (fields:Record<string,string>,bank=false) => Object.entries(fields).map(([k,v])=>`${k==='legalName'&&bank?'Account holder':labels[k]}: ${v}`);
  let tax: DemoDocument|null = {name:`sample-${id}-registration.pdf`,type:'application/pdf',content:pdf(lines(taxFields),id==='page-limit'?11:1)};
  let bank: DemoDocument|null = {name:`sample-${id}-bank.pdf`,type:'application/pdf',content:pdf(lines(bankFields,true))};
  if (id==='missing'||id==='missing-both'||id==='duplicate-incomplete') bank=null;
  if (id==='missing-tax'||id==='missing-both') tax=null;
  if (id==='conflicting') bank={name:'sample-conflicting-bank.txt',type:'text/plain',content:[...lines(bankFields,true),'Account number: 777777775678'].join('\n')};
  if (id==='unlabelled') bank={name:'sample-unlabelled-bank.txt',type:'text/plain',content:`Fictional correspondence. ${input.legalName} banks with HDFC. Reference ${input.account}. No labelled confirmation fields are supplied.`};
  if (id==='invalid-json') tax={name:'sample-broken-registration.json',type:'application/json',content:'{"legalName": "Broken document",'};
  if (id==='json-types') bank={name:'sample-numeric-bank.json',type:'application/json',content:JSON.stringify({...bankFields,account:123456789012})};
  if (id==='no-text') bank={name:'sample-no-text-bank.pdf',type:'application/pdf',content:pdf([])};
  if (id==='malformed-pdf') bank={name:'sample-damaged-bank.pdf',type:'application/pdf',content:'This is a fictional damaged file, not a PDF.'};
  return {input,tax,bank,scenarioId:id,suiteId};
}
export function scenarioFormData(sample: DemoSubmission) {
  const form = new FormData();
  Object.entries(sample.input).forEach(([key,value])=>form.set(key,value));
  for (const kind of ['tax','bank'] as const) {const doc=sample[kind];if(doc) form.set(kind,new File([doc.content],doc.name,{type:doc.type}));}
  form.set('demoScenario',sample.scenarioId);form.set('demoSuite',sample.suiteId);
  return form;
}
