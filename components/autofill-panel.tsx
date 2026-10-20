"use client";

import {useRef} from 'react';
import {CircleAlert,FileCheck2,Loader2,Upload} from 'lucide-react';
import {FIELD_LABELS,type FormField,type ImportReport,type ImportRole} from '../lib/autofill';
import type {Submission} from '../lib/review';

type Props={reports:Partial<Record<ImportRole,ImportReport>>;importing:Partial<Record<ImportRole,string>>;input:Submission;onImport:(file:File)=>void;onUse:(role:ImportRole,field:FormField)=>void};
export default function AutofillPanel({reports,importing,input,onImport,onUse}:Props) {
  const picker=useRef<HTMLInputElement>(null);
  const busy=Object.values(importing).length>0;
  return <section className="panel form-section autofill-panel" aria-label="Autofill vendor details">
    <div className="autofill-heading"><div><span className="mini-label">START WITH YOUR DOCUMENTS</span><h2>Fill from a document</h2><p>Import a vendor details file, or attach your registration and bank proofs below. Empty fields fill automatically; your edits stay in place.</p></div><Upload size={23} aria-hidden="true"/></div>
    <div className="autofill-actions"><input ref={picker} type="file" accept=".pdf,.txt,.json" aria-label="Import vendor details file" className="sr-only" onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(file)onImport(file);}}/><button className="button secondary" type="button" disabled={busy} onClick={()=>picker.current?.click()}>{importing.profile?<Loader2 size={16} className="spin"/>:<Upload size={16}/>}Upload vendor details</button><a className="text-button" href="/samples/vendor-details.txt" download>Download example TXT</a></div>
    <p className="autofill-hint">Text-based PDF, TXT or JSON · 2 MB · up to 10 PDF pages. Fields must be labelled. Scans need manual entry. A details import does not attach supporting proofs or run a review.</p>
    <div className="autofill-feedback" aria-live="polite" aria-atomic="false">
      {Object.entries(importing).map(([role,name])=><p className="autofill-reading" key={role}><Loader2 size={15} className="spin"/>Reading {name}… You can continue editing.</p>)}
      {Object.entries(reports).map(([role,report])=>report && !importing[role as ImportRole] && <div className={`import-report ${report.error?'import-error':''}`} key={role}>
        <div className="import-report-heading">{report.error?<CircleAlert size={17}/>:<FileCheck2 size={17}/>}<strong>{report.fileName}</strong></div>
        {report.error?<p>{report.error} Your form values have been kept.</p>:<>
          <p>{report.filled.length?`${report.filled.length} field${report.filled.length===1?'':'s'} filled. Review the values below before submitting.`:Object.keys(report.fields).length?'The form already has values for the extracted fields.':'No supported form fields were found. Use labels such as Company name, GSTIN, Account number and IFSC, or enter details manually.'}</p>
          {report.filled.length>0 && <div className="autofill-fields">{report.filled.map(field=><span key={field}>{FIELD_LABELS[field]}</span>)}</div>}
          {report.warnings.map(warning=><p className="autofill-warning" key={warning}><CircleAlert size={14}/>{warning}</p>)}
          {report.kept.length>0 && <details className="autofill-conflicts"><summary>{report.kept.length} entered value{report.kept.length===1?'':'s'} kept · Review alternatives</summary>{report.kept.map(field=><div className="autofill-conflict" key={field}><strong>{FIELD_LABELS[field]}</strong><p>In your form: <span>{input[field]||'Empty'}</span></p><p>From {report.sources[field]||'document'}: <span>{report.fields[field]}</span></p><button type="button" className="text-button" onClick={()=>onUse(role as ImportRole,field)}>Use extracted {FIELD_LABELS[field].toLowerCase()}</button></div>)}</details>}
        </>}
      </div>)}
    </div>
  </section>;
}
