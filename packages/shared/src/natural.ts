import { detailsSchema, type EventDetails, type Category } from './index';
export type LogDraft = { category: Category; details: EventDetails; notes: string; childIds?: string[]; occurredAt?: string; endedAt?: string };
export type ParseContext = { now: Date; timezone?: string; children: { id: string; firstName: string }[] };
export interface CareLogParser { parse(text: string, context?: ParseContext): LogDraft | null }
/** Fully anchored local grammar: unrecognized or ambiguous content never silently disappears. */
export function parseLog(text: string, context?: ParseContext): LogDraft | null {
  if (text.length > 6000) return null;
  let input = text.trim(); let notes = ''; let childIds: string[] | undefined; let occurredAt: string | undefined; let endedAt: string | undefined;
  const note = input.match(/\s*;\s*(?:note|notes):\s*([\s\S]*)$/i);
  if (note) { notes = note[1]; input = input.slice(0, note.index).trim(); }
  if(context && !input.includes(': ')) {
    const escape=(value:string)=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const names=context.children.map(c=>escape(c.firstName)).sort((a,b)=>b.length-a.length).join('|');
    if(names){const named=input.match(new RegExp(`^((?:${names})(?:\\s+(?:and|&)\\s+(?:${names}))*)\\s+((?:had|was|drank|ate|nursed|slept|weighed|pumped|has)\\b.*)$`,'i'));if(named)input=`${named[1]}: ${named[2].replace(/^(?:had|was)\s+(?:a\s+)?/i,'')}`;}
  }
  const prefix = input.match(/^([^:]+):\s+/);
  if (prefix) {
    if (!context) return null;
    const names = prefix[1].split(/\s+(?:and|&)\s+|\s*,\s*/).map(s=>s.trim().toLowerCase());
    childIds = [];
    for (const name of names) { const matches = context.children.filter(c=>c.firstName.toLowerCase()===name); if(matches.length!==1) return null; childIds.push(matches[0].id); }
    if(new Set(childIds).size!==childIds.length) return null;
    input = input.slice(prefix[0].length);
  }
  const relative = input.match(/\s+(\d+)\s+(minutes?|mins?|hours?|hrs?)\s+ago$/i);
  const clockTime = input.match(/\s+(?:(today|yesterday)\s+)?at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
  const absolute = input.match(/\s+at\s+(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2}))$/i);
  if(relative || absolute || clockTime) {
    if(!context) return null;
    let at = relative ? +context.now-Number(relative[1])*(/^(hour|hr)/i.test(relative[2])?3600000:60000) : absolute ? Date.parse(absolute[1]) : NaN;
    if(clockTime) {
      const hour=Number(clockTime[2]); const minute=Number(clockTime[3]||0); if(hour<1||hour>12||minute>59)return null;
      const zone=context.timezone||'UTC';const format=new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
      const parts=(n:number)=>Object.fromEntries(format.formatToParts(n).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));
      const date=parts(+context.now);const desired=Date.UTC(date.year,date.month-1,date.day-(clockTime[1]?.toLowerCase()==='yesterday'?1:0),hour%12+(clockTime[4].toLowerCase()==='pm'?12:0),minute);
      at=desired;for(let i=0;i<3;i++){const observed=parts(at);at+=desired-Date.UTC(observed.year,observed.month-1,observed.day,observed.hour,observed.minute);}
      const final=parts(at);if([-3600000,3600000].some(offset=>{const other=parts(at+offset);return other.day===final.day&&other.month===final.month&&other.year===final.year&&other.hour===final.hour&&other.minute===final.minute;}))return null;
      if(final.hour!==hour%12+(clockTime[4].toLowerCase()==='pm'?12:0)||final.minute!==minute)return null;
    }
    if(!Number.isFinite(at) || at > +context.now || at < +context.now-366*86400000) return null;
    occurredAt = new Date(at).toISOString(); input = input.slice(0,(relative||absolute||clockTime)!.index).trim();
  }
  input=input.replace(/^changed\s+(?:a\s+)?((?:wet|dirty|mixed|dry)\s+diaper)$/i,'$1').replace(/^weighed\s+/i,'weight ');
  input=input.replace(/^(\d+(?:\.\d+)?)\s*(ml|oz)\s+bottle$/i,'bottle $1 $2');
  let duration: number | undefined;
  const timed = input.match(/\s+for\s+(\d+(?:\.\d+)?)\s*(minutes?|mins?|hours?|hrs?)$/i);
  if(timed) { duration = Number(timed[1])*(/^(hour|hr)/i.test(timed[2])?60:1); if(duration<=0 || duration>1440 || !context) return null; input=input.slice(0,timed.index).trim(); }
  let category: Category; let details: EventDetails = {}; let match: RegExpMatchArray | null;
  if((match=input.match(/^(?:bottle|drank|fed)\s+(\d+(?:\.\d+)?)\s*(ml|oz)(?:\s+(formula|breast milk|cow milk))?$/i))) { category='bottle'; details={quantity:Number(match[1]),unit:match[2].toLowerCase() as 'ml'|'oz', ...(match[3]?{milkType:match[3].toLowerCase() as EventDetails['milkType']}:{})}; }
  else if((match=input.match(/^(?:pumped|pumping|water)\s+(\d+(?:\.\d+)?)\s*(ml|oz)$/i))) { category=/^water/i.test(input)?'water':'pumping'; details={quantity:Number(match[1]),unit:match[2].toLowerCase() as 'ml'|'oz'}; }
  else if((match=input.match(/^(wet|dirty|mixed|dry)\s+diaper$/i))) { category='diaper'; details={diaperType:match[1].toLowerCase() as EventDetails['diaperType']}; }
  else if((match=input.match(/^(?:sleep|slept|nap|napped|night sleep)$/i))) { category='sleep'; details={sleepKind:/night/i.test(match[0])?'night':'nap'}; }
  else if((match=input.match(/^(?:nursed|nursing|breastfed)(?:\s+(left|right|both))?$/i))) { category='nursing'; details={side:(match[1]?.toLowerCase() || 'both') as EventDetails['side']}; }
  else if((match=input.match(/^(?:food|solids|ate)\s+(.+)$/i))) { category='food'; details={food:match[1]}; }
  else if((match=input.match(/^potty\s+(success|attempt)$/i))) { category='potty'; details={pottyResult:match[1].toLowerCase() as EventDetails['pottyResult']}; }
  else if((match=input.match(/^medicine\s+(.+?)\s+(\d+(?:\.\d+)?)\s*(mg|ml|drops|dose)$/i))) { category='medicine'; details={medicineName:match[1],quantity:Number(match[2]),unit:match[3].toLowerCase() as EventDetails['unit']}; }
  else if((match=input.match(/^(?:temperature|temp)\s+(\d+(?:\.\d+)?)\s*°?\s*(C|F)(?:\s+(axillary|oral|rectal|ear|forehead|other))?$/i))) { category='temperature'; details={quantity:Number(match[1]),unit:match[2].toUpperCase() as 'C'|'F',...(match[3]?{temperatureMethod:match[3].toLowerCase() as EventDetails['temperatureMethod']}:{})}; }
  else if((match=input.match(/^symptom\s+(?:(mild|moderate|severe)\s+)?(.+)$/i))) { category='symptom'; details={symptomName:match[2],...(match[1]?{severity:match[1].toLowerCase() as EventDetails['severity']}:{})}; }
  else if((match=input.match(/^(weight|height|head)\s+(\d+(?:\.\d+)?)\s*(kg|g|lb|cm|in)$/i))) { category='growth'; const measurement=match[1].toLowerCase() as 'weight'|'height'|'head'; const unit=match[3].toLowerCase() as EventDetails['unit']; if(measurement==='weight'?!['kg','g','lb'].includes(unit!):!['cm','in'].includes(unit!)) return null; details={measurement,quantity:Number(match[2]),unit}; }
  else if((match=input.match(/^(bath|teeth|brushed teeth)$/i))) { category=/teeth/i.test(match[1])?'teeth':'bath'; }
  else if((match=input.match(/^(routine|milestone|note|custom)\s+(.+)$/i))) { category=['note','custom'].includes(match[1].toLowerCase())?'custom':match[1].toLowerCase() as Category; if(category==='custom') details={customLabel:match[1].toLowerCase()==='note'?'Note':match[2]}; notes=[match[2],notes].filter(Boolean).join('\n'); }
  else return null;
  if(duration!==undefined) { if(!['sleep','nursing','pumping'].includes(category)) return null; const end=occurredAt?Date.parse(occurredAt)+duration*60000:+context!.now; if(end>+context!.now) return null; endedAt=new Date(end).toISOString(); occurredAt=new Date(end-duration*60000).toISOString(); }
  if(!detailsSchema.safeParse(details).success || notes.length>5000 || (details.quantity!==undefined && details.quantity<=0)) return null;
  return { category, details, notes, ...(childIds?{childIds}:{}), ...(occurredAt?{occurredAt}:{}), ...(endedAt?{endedAt}:{}) };
}
export const deterministicParser: CareLogParser = { parse: parseLog };
