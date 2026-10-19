import { gstCheckDigit, normalizeName, normalizeTax, validTax, type Check, type Evidence, type Submission } from './review.ts';

export const SERVICE_CATEGORIES = [
  {id:'general',label:'General goods and services'},
  {id:'gambling',label:'Gambling services (excluded by demo policy)'},
] as const;

// Fictional, server-owned reference records. These are not government or sanctions results.
export const POLICY_REFERENCES = [
  {id:'DEMO-BLOCK-001',kind:'blocked',country:'IN',taxId:'29AAAAB9001A1Z'+gstCheckDigit('29AAAAB9001A1Z'),legalName:'Ironbridge Demo Private Limited',reason:'Procurement has an active do-not-onboard restriction after an unresolved supplier contract dispute.',action:'Contact procurement with reference DEMO-BLOCK-001. Only the policy owner can lift this restriction; uploading new documents does not remove it.'},
  {id:'DEMO-REG-002',kind:'revoked',country:'IN',taxId:'29AAAAC9002A1Z'+gstCheckDigit('29AAAAC9002A1Z'),legalName:'Westport Demo Private Limited',reason:'The fictional registration reference marks this GSTIN as revoked. A matching uploaded certificate does not override that status.',action:'Ask procurement to verify reinstatement and update reference DEMO-REG-002 before submitting again.'},
] as const;

export function policyChecks(s: Submission, evidence: Evidence[]): Check[] {
  const certificate = evidence.find(doc=>doc.kind==='tax');
  const result: Check[] = POLICY_REFERENCES.map(record=> {
    const source=`Fictional demo policy reference · ${record.id}`;
    const id=record.kind==='blocked'?'vendor-restriction':'registration-standing';
    const label=record.kind==='blocked'?'Internal vendor restriction':'Registration standing';
    const match=s.country===record.country && normalizeTax(s.taxId)===record.taxId;
    if(!match) return {id,label,state:'pass',source,detail:`No matching ${record.kind==='blocked'?'restriction':'revocation'} in the local fictional dataset. This does not confirm external clearance or active government registration.`};
    const identityConfirmed=validTax(record.taxId) && normalizeName(s.legalName)===normalizeName(record.legalName) && certificate && !certificate.error && normalizeName(certificate.fields.legalName||'')===normalizeName(record.legalName) && normalizeTax(certificate.fields.taxId||'')===record.taxId;
    if(!identityConfirmed) return {id,label,state:'review',source,detail:`GSTIN matches ${record.id}, but the company identity is not confirmed by matching registration evidence. Do not treat a partial match as a confirmed restriction.`,action:'Ask procurement to resolve the reference match using a readable certificate with the matching legal name and GSTIN.'};
    return {id,label,state:'fail',terminal:true,source,detail:`${record.reason} Matched legal name and GSTIN against ${record.id}. Demo reference only; no external verification was performed.`,action:record.action};
  });
  const category=s.serviceCategory||'general';
  result.push(category==='gambling'
    ? {id:'service-category',label:'Permitted service category',state:'fail',terminal:true,source:'Demo procurement policy · CATEGORY-001',detail:'The submitted category is Gambling services, which this demo procurement policy excludes. This is an internal purchasing rule, not a legal or regulatory determination.',action:'This service category cannot be onboarded under the current policy. Contact procurement if the category was entered incorrectly; any correction must accurately describe the service.'}
    : category==='general'
      ? {id:'service-category',label:'Permitted service category',state:'pass',source:'Demo procurement policy · CATEGORY-001',detail:'General goods and services are within the configured purchasing scope. Category is supplied on the form; it is not independently verified.'}
      : {id:'service-category',label:'Permitted service category',state:'review',source:'Demo procurement policy · CATEGORY-001',detail:'The submitted service category is not recognized.',action:'Select a supported service category or request procurement review.'});
  return result;
}
