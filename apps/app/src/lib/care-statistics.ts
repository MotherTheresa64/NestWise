import { mealFoods, type CareEvent } from '@nestwise/shared';
export function careBreakdown(records:CareEvent[]):{label:string;count:number}[] {
  const counts=new Map<string,number>();const add=(key:string)=>counts.set(key,(counts.get(key)||0)+1);
  for(const e of records.filter(e=>!e.deletedAt)) {
    if(e.category==='diaper') add(({wet:'Pee-only diapers',dirty:'Poo-only diapers',mixed:'Mixed diapers',dry:'Dry diapers'} as const)[e.details.diaperType || 'wet']);
    else if(e.category==='potty')add(`Potty ${e.details.pottyResult || 'attempt'}`);
    else if(e.category==='food'){add('Meals');for(const name of new Set(mealFoods(e.details).map(f=>f.name.trim().toLowerCase())))add(`Meals with ${name}`);}
    else add(`${e.category[0].toUpperCase()+e.category.slice(1)} sessions`);
  }
  return [...counts].map(([label,count])=>({label,count}));
}
export function hourDistribution(records:CareEvent[],day:string,timezone:string):number[]{
  const counts=Array<number>(24).fill(0);
  const date=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'});
  const hour=new Intl.DateTimeFormat('en-US',{timeZone:timezone,hour:'numeric',hourCycle:'h23'});
  for(const e of records)if(!e.deletedAt){const time=new Date(e.occurredAt);const parts=date.formatToParts(time);const local=['year','month','day'].map(k=>parts.find(p=>p.type===k)!.value).join('-');if(local===day)counts[Number(hour.format(time))]++;}
  return counts;
}
