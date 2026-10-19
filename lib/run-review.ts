import type { Review, Stage } from './review.ts';
export type ReviewEvent = {type:'start';id:string} | {type:'stage';stage:Stage} | {type:'complete';review:Review} | {type:'error';message:string};
export async function runReview(form: FormData, onEvent: (event: ReviewEvent)=>void, origin=''): Promise<Review> {
  const res=await fetch(`${origin}/api/reviews`,{method:'POST',body:form});
  if (!res.ok) {const data=await res.json() as {error?:string};throw new Error(data.error||'The review could not be started.');}
  if (!res.body) throw new Error('The review stream is unavailable.');
  const reader=res.body.getReader(), decoder=new TextDecoder();let buffer='';let review:Review|undefined;
  function line(value:string) {if(!value.trim())return;const event=JSON.parse(value) as ReviewEvent;if(event.type==='error')throw new Error(event.message);if(event.type==='complete')review=event.review;onEvent(event);}
  try {
    while(true){const {done,value}=await reader.read();buffer+=decoder.decode(value,{stream:!done});const lines=buffer.split('\n');buffer=lines.pop()||'';lines.forEach(line);if(done)break;}
    if(buffer)line(buffer);
    if(!review)throw new Error('Connection ended before completion. Check history before retrying.');
    return review;
  } finally {reader.releaseLock();}
}
