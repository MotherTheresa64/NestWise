import {describe,it,expect} from 'vitest';
import {type CareEvent,type Snapshot,type FoodMutation} from '@nestwise/shared';
import {optimisticFoods,applyFoodResult} from './food-queue';
import {applyChanges,optimisticEvents} from './queue';
import {careBreakdown,hourDistribution} from './care-statistics';
import {makeReport,reportHtml} from './report-model';
const event=(details:CareEvent['details'],category:CareEvent['category']='food',occurredAt='2026-11-01T06:30:00Z'):CareEvent=>({id:'event',childIds:['child'],householdId:'household',category,occurredAt,endedAt:null,notes:'PRIVATE NOTE',details,createdBy:'owner',createdByName:'Caregiver',updatedBy:'owner',createdAt:occurredAt,updatedAt:occurredAt,version:1,deletedAt:null});
const snapshot:Snapshot={household:{id:'household',name:'Family',role:'owner',timezone:'UTC'},children:[],events:[],members:[],reminders:[],serverTime:'2026-01-01T00:00:00Z',revision:0};
describe('richer offline records and report semantics',()=>{
  it('round-trips rich optimistic event fields through durable JSON',()=>{
    const e=event({foods:[{name:'Oatmeal',amount:2,unit:'tbsp',preference:'liked'}]});
    const queue=JSON.parse(JSON.stringify([{mutationId:'mutation',eventId:e.id,operation:'create',baseVersion:0,event:e}]));
    expect(optimisticEvents(snapshot,queue,{id:'owner',name:'Owner'})[0].details).toEqual(e.details);
  });
  it('preserves food edits through optimistic replay and keeps server conflicts distinct',()=>{
    const mutation:FoodMutation={mutationId:'mutation',foodId:'food',baseVersion:0,food:{name:'Oatmeal',childIds:[],active:true,favorite:true}};
    const projected=optimisticFoods([],JSON.parse(JSON.stringify([mutation])),'household');expect(projected[0].name).toBe('Oatmeal');
    const server={...projected[0],name:'Server oatmeal',version:2};expect(applyFoodResult(projected,{mutationId:'mutation',status:'conflict',food:server},'food')[0]).toEqual(server);
    const next=applyChanges(snapshot,[{revision:1,kind:'foods',entityId:'food',record:server}],'owner');expect(next.foods).toEqual([server]);expect(next.reminders).toEqual([]);
    expect(applyChanges(next,[{revision:2,kind:'foods',entityId:'food',record:null}],'owner').foods).toEqual([]);
  });
  it('counts each food once per meal and keeps mixed diapers separate',()=>{
    const result=careBreakdown([event({foods:[{name:'Oatmeal'},{name:'oatmeal'},{name:'Banana'}]}),event({diaperType:'mixed',peeAmount:'big',pooAmount:'medium'},'diaper'),{...event({food:'Ignore'}),deletedAt:'2026-01-01T00:00:00Z'}]);
    expect(result).toEqual([{label:'Meals',count:1},{label:'Meals with oatmeal',count:1},{label:'Meals with banana',count:1},{label:'Mixed diapers',count:1}]);
  });
  it('combines repeated household-local DST hours without duplicating events',()=>{
    const records=[event({},'bath','2026-11-01T06:30:00Z'),event({},'bath','2026-11-01T07:30:00Z')];
    const hours=hourDistribution(records,'2026-11-01','America/Chicago');expect(hours[1]).toBe(2);expect(hours.reduce((a,b)=>a+b,0)).toBe(2);
    expect(hourDistribution(records,'2026-11-02','America/Chicago').every(v=>v===0)).toBe(true);
  });
  it('exports structured foods safely, preserving private-note selection',()=>{
    const child={id:'child',householdId:'household',firstName:'River',middleName:'',nickname:'',dateOfBirth:'2026-01-01',dueDate:null,notes:'',active:true,timezone:null,enabledCategories:[],createdAt:'2026-01-01T00:00:00Z'};
    const report=makeReport([event({foods:[{name:'<script>Food</script>',amount:2,unit:'tbsp'}]})],[child],'2026-11-01','2026-11-01','UTC',['feeding'],Date.parse('2026-11-02T00:00:00Z'));
    const html=reportHtml(report,false);expect(html).toContain('&lt;script&gt;Food&lt;/script&gt;');expect(html).not.toContain('[object Object]');expect(html).not.toContain('PRIVATE NOTE');expect(reportHtml(report,true)).toContain('PRIVATE NOTE');
  });
});
