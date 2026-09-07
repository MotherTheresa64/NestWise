import console from 'node:console';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
const api = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001';
if (process.env.NODE_ENV === 'production' || !['localhost','127.0.0.1'].includes(new URL(api).hostname)) throw new Error('Fictional seeding is restricted to a local development API.');
const password = 'Fictional-family-demo-only-2026';
let token;
const post = async (path,data) => { const response=await fetch(api+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(data)});if(!response.ok)throw new Error(`${path}: ${response.status} ${await response.text()}`);return response.json();};
const auth=await post('/auth/register',{name:'Morgan (fictional)',email:`fictional-${Date.now()}@example.test`,password});token=auth.token;
const h=await post('/households',{name:'The Willow family (fictional)',timezone:'America/Chicago'});
const children=[];for(const firstName of ['River','Sage'])children.push(await post(`/households/${h.id}/children`,{firstName,dateOfBirth:'2026-03-01',notes:'Completely fictional profile for development and visual testing.'}));
const mutations=[];
const add=(childIds,category,at,details={},minutes,notes='Fictional development care history.')=>{if(at>Date.now())return;const id=randomUUID();mutations.push({mutationId:randomUUID(),eventId:id,baseVersion:0,operation:'create',event:{id,childIds,category,occurredAt:new Date(at).toISOString(),endedAt:minutes?new Date(at+minutes*60000).toISOString():null,details,notes}});};
const midnight=new Date();midnight.setHours(0,0,0,0);
for(let day=21;day>=1;day--){const base=+midnight-day*86400000;
 for(const [index,child] of children.entries()){
  for(const hour of [7,10,13,16,19])add([child.id],'bottle',base+(hour*60+index*10+(day%3)*5)*60000,{quantity:110+(day%4)*10,unit:'ml',milkType:'formula'});
  for(const [hour,duration] of [[9,55],[13,80],[16,35]])add([child.id],'sleep',base+(hour*60+index*15)*60000,{sleepKind:'nap',sleepLocation:'Cot'},duration+(day%3)*5);
  add([child.id],'sleep',base+(20*60+index*10)*60000,{sleepKind:'night'},600);
  for(const hour of [7,10,14,18,20])add([child.id],'diaper',base+(hour*60+25)*60000,{diaperType:hour===14?'mixed':'wet'});
  if(day%3===0)add([child.id],'food',base+12*3600000,{food:'Banana and oat puree',foodTexture:'puree'});
  if(day%7===0)add([child.id],'growth',base+8*3600000,{measurement:'weight',quantity:6.4+(21-day)*.01+index*.2,unit:'kg'});
 }
 add(children.map(c=>c.id),'routine',base+18*3600000,{},undefined,'Fictional shared story time.');
 if(day%2===0)add(children.map(c=>c.id),'bath',base+19*3600000);
}
const other=[['nursing',{side:'left'},15],['pumping',{quantity:80,unit:'ml'},20],['water',{quantity:15,unit:'ml'}],['potty',{pottyResult:'attempt'}],['medicine',{medicineName:'Fictional example only',quantity:1,unit:'dose'}],['temperature',{quantity:36.8,unit:'C',temperatureMethod:'forehead'}],['symptom',{symptomName:'Fictional observation',severity:'mild'}],['teeth',{}],['milestone',{}],['custom',{customLabel:'Family visit'}]];
for(const [i,[category,details,duration]] of other.entries())add([children[i%2].id],category,Date.now()-(i+1)*3600000,details,duration);
for(let i=0;i<mutations.length;i+=60)await post(`/households/${h.id}/sync`,mutations.slice(i,i+60));
await post(`/households/${h.id}/reminders`,{title:'Pack the care bag (fictional)',childIds:[],category:'routine',dueAt:new Date(Date.now()+3600000).toISOString(),repeatMinutes:1440});
await mkdir('.local',{recursive:true});await writeFile('.local/fictional-seed.json',JSON.stringify({...auth,password,householdId:h.id},null,2));
console.log(`Created fictional household with ${children.length} children and ${mutations.length} events. Local test credentials saved in ignored .local/fictional-seed.json.`);
