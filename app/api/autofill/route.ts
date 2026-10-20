import {readDocumentText} from '../../../lib/extract';
import {parseAutofill, type ImportRole} from '../../../lib/autofill';

export const dynamic='force-dynamic';
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export async function POST(request:Request) {
  if(Number(request.headers.get('content-length')||0)>3*1024*1024) return json({error:'Each document must be 2 MB or smaller.'},413);
  let form:FormData;
  try {form=await request.formData();} catch {return json({error:'Choose a PDF, TXT, or JSON file to autofill the form.'},400);}
  const file=form.get('file'),role=String(form.get('role')||'profile');
  if(!(file instanceof File)||file.size===0) return json({error:'Choose a non-empty document.'},400);
  if(file.size>2*1024*1024) return json({error:'Each document must be 2 MB or smaller.'},413);
  if(!/\.(pdf|txt|json)$/i.test(file.name)) return json({error:'Use a text-based PDF, TXT, or JSON file.'},415);
  if(!['profile','tax','bank'].includes(role)) return json({error:'Unknown document role.'},400);
  try {
    const document=await readDocumentText(file);
    const result=parseAutofill(document.text,document.format==='JSON',role as ImportRole);
    return json({...result,fileName:file.name,format:document.format,pages:document.pages});
  } catch(error) {return json({error:error instanceof Error?error.message:'The document could not be read. Enter the details manually.'},422);}
}
