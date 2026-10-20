import { normalizeAccount, normalizeName, normalizeTax, type Submission } from './review.ts';

export const FORM_FIELDS = ['legalName','email','country','serviceCategory','taxId','account','bankCode'] as const;
export type FormField = typeof FORM_FIELDS[number];
export type ImportRole = 'profile' | 'tax' | 'bank';
export type AutofillResult = {fields: Partial<Submission>; sources: Partial<Record<FormField,string>>; warnings: string[]; fileName: string; format: string; pages: number};
export type ImportReport = AutofillResult & {filled: FormField[]; kept: FormField[]; error?: string};
export const FIELD_LABELS: Record<FormField,string> = {legalName:'Company name',email:'Contact email',country:'Country',serviceCategory:'Service category',taxId:'GSTIN',account:'Bank account number',bankCode:'IFSC'};
type ExtractedField = FormField | 'accountHolder';
const LABELS: Record<string,ExtractedField> = {
  'company name':'legalName','registered company name':'legalName','legal name':'legalName','registered name':'legalName',
  'account holder':'accountHolder','account holder name':'accountHolder',
  'email':'email','e mail':'email','contact email':'email','email address':'email',
  'country':'country','country code':'country','service category':'serviceCategory',
  'gstin':'taxId','gst number':'taxId','tax id':'taxId','tax identifier':'taxId',
  'account':'account','account number':'account','bank account number':'account','bank account':'account','account no':'account',
  'ifsc':'bankCode','ifsc code':'bankCode','bank code':'bankCode',
};
const canonical: Record<string,ExtractedField> = Object.fromEntries([...FORM_FIELDS,'accountHolder'].map(key=>[key,key])) as Record<string,ExtractedField>;
function normalize(field: ExtractedField, value: string) {
  if(field==='legalName'||field==='accountHolder') return normalizeName(value);
  if(field==='account') return normalizeAccount(value);
  if(field==='taxId') return normalizeTax(value);
  if(field==='country') return /^(india|in)$/i.test(value)?'IN':/^(us|usa|united states|united states of america)$/i.test(value)?'US':value.toUpperCase();
  if(field==='serviceCategory') return /^(general|general goods and services)$/i.test(value)?'general':/^(gambling|gambling services(?: \(excluded by demo policy\))?)$/i.test(value)?'gambling':value;
  return value.toUpperCase();
}
export const sameFieldValue = (field: FormField, a: string, b: string) => normalize(field,a)===normalize(field,b);

export function parseAutofill(text: string, json = false, role: ImportRole = 'profile'): Pick<AutofillResult,'fields'|'sources'|'warnings'> {
  const values: Partial<Record<ExtractedField,string>> = {}, labels: Partial<Record<ExtractedField,string>> = {};
  const blocked = new Set<ExtractedField>(), warnings: string[] = [];
  function add(field: ExtractedField, raw: unknown, label: string) {
    if(typeof raw!=='string') {blocked.add(field);delete values[field];warnings.push(`${label} must be text. Enter it manually.`);return;}
    const value=raw.trim(); if(!value) return;
    if(value.length>200) {blocked.add(field);delete values[field];warnings.push(`${label} is too long to import. Enter it manually.`);return;}
    if(blocked.has(field)) return;
    if(values[field] && normalize(field,values[field]!)!==normalize(field,value)) {blocked.add(field);delete values[field];warnings.push(`Conflicting ${label} values were found. This field was left for manual entry.`);return;}
    values[field]=value;labels[field]=label;
  }
  if(json) {
    const object=JSON.parse(text);
    if(!object||typeof object!=='object'||Array.isArray(object)) throw new Error('Use a JSON object containing vendor fields.');
    for(const [key,value] of Object.entries(object)) if(Object.hasOwn(canonical,key)) add(canonical[key],value,key);
  } else {
    for(const line of text.split(/[\r\n]+/)) {
      const match=line.trim().match(/^([A-Za-z ._-]+?)\s*[:=]\s*(.+)$/);if(!match) continue;
      const label=match[1].replace(/[._-]/g,' ').replace(/\s+/g,' ').trim();
      const key=label.toLowerCase();
      if(Object.hasOwn(LABELS,key)) add(LABELS[key],match[2],label);
    }
  }
  const fields: Partial<Submission> = {}, sources: Partial<Record<FormField,string>> = {};
  for(const field of FORM_FIELDS) {
    if(role==='tax' && !['legalName','taxId','country'].includes(field)) continue;
    if(role==='bank' && !['account','bankCode'].includes(field)) continue;
    let value=values[field]; if(!value) continue;
    if(field==='email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {warnings.push('The contact email is not valid. Enter it manually.');continue;}
    if(field==='account' && !/^\d{9,18}$/.test(normalizeAccount(value))) {warnings.push('The bank account is masked or outside the supported 9–18 digit format. Enter the full number manually.');continue;}
    if((field==='taxId' && normalizeTax(value).length>15)||(field==='bankCode' && value.length>11)) {warnings.push(`${FIELD_LABELS[field]} is longer than the supported format. Enter it manually.`);continue;}
    if(['country','serviceCategory','taxId','bankCode'].includes(field)) value=normalize(field,value);
    fields[field]=value;sources[field]=labels[field];
  }
  // A bank holder is evidence to compare, not a replacement for the vendor's legal name.
  if(role==='profile' && !values.legalName && values.accountHolder) warnings.push('Only an account holder name was found. Enter the registered company name separately.');
  if(values.legalName && values.accountHolder && normalizeName(values.legalName)!==normalizeName(values.accountHolder)) warnings.push('Company name and bank account holder differ. The company name was kept; review the original evidence.');
  return {fields,sources,warnings:[...new Set(warnings)]};
}

export function mergeAutofill(current: Submission, extracted: Partial<Submission>, edited: ReadonlySet<FormField>) {
  const next={...current},filled:FormField[]=[],kept:FormField[]=[];
  for(const field of FORM_FIELDS) {
    const value=extracted[field];if(!value) continue;
    const previous=current[field]||'';
    if(previous && sameFieldValue(field,previous,value)) continue;
    const untouchedDefault=(field==='country'&&previous==='IN')||(field==='serviceCategory'&&previous==='general');
    if(!edited.has(field) && (!previous || untouchedDefault)) {next[field]=value;filled.push(field);} else kept.push(field);
  }
  return {next,filled,kept};
}
