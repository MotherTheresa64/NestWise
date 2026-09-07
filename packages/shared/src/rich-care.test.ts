import { describe,it,expect } from 'vitest';
import { eventInputSchema, eventSummary, repeatDetails, mealFoods, foodInputSchema, type Category } from './index';
const input={id:'11111111-1111-4111-8111-111111111111',childIds:['22222222-2222-4222-8222-222222222222'],occurredAt:'2026-09-01T12:00:00Z',endedAt:null,notes:''};
describe('structured care, old records and safe repeat drafts',()=>{
  it.each([
    ['food',{food:'Oatmeal',reaction:'Smiled'}],['diaper',{diaperType:'wet',stoolColor:'legacy note'}],['bottle',{quantity:8,unit:'oz',milkType:'cow milk'}],['nursing',{}],['pumping',{}],['sleep',{}],['symptom',{symptomName:'Cough'}],['growth',{quantity:7,unit:'kg',measurement:'weight'}],
  ] as [Category,Record<string,unknown>][])('loads legacy %s details unchanged',(category,details)=>expect(eventInputSchema.parse({...input,category,details}).details).toEqual(details));
  it('stores independent mixed-diaper components and readable text',()=>{
    const event=eventInputSchema.parse({...input,category:'diaper',details:{diaperType:'mixed',peeAmount:'big',pooAmount:'medium',diaperRash:true,stoolColor:'brown',stoolConsistency:'soft'}});
    expect(eventSummary(event)).toBe('Mixed diaper · big pee · medium poo · rash observed');
    expect(eventInputSchema.safeParse({...event,details:{...event.details,diaperType:'wet'}}).success).toBe(false);
  });
  it('keeps multi-food portions and caregiver observations structured',()=>{
    const event=eventInputSchema.parse({...input,category:'food',details:{foods:[{name:'Oatmeal',amount:2,unit:'tbsp',preference:'liked'},{name:'Banana',sensitivityObserved:true,observation:'Red patch noticed'}]}});
    expect(eventSummary(event)).toContain('Oatmeal · 2 tbsp · liked + Banana');
    expect(repeatDetails(event)).toEqual({foods:[{foodId:undefined,name:'Oatmeal',amount:2,unit:'tbsp'},{foodId:undefined,name:'Banana',amount:undefined,unit:undefined}],foodTexture:undefined});
    expect(mealFoods({food:'Legacy food'})).toEqual([{name:'Legacy food'}]);
  });
  it.each([
    {foods:[{name:''}]},{foods:[{name:'Food',amount:1}]},{foods:[{name:'Food',amount:-1,unit:'g'}]},{foods:[{name:'Food',unexpected:true}]},{foods:Array.from({length:21},()=>({name:'Food'}))},{symptoms:[{name:'Cough',severity:'diagnosed'}]},{sessionMinutes:Infinity},{peeAmount:'huge'},{diaperRash:'yes'},{routineSteps:['']},
  ])('rejects invalid new structured fields %j',details=>expect(eventInputSchema.safeParse({...input,category:details.symptoms?'symptom':'food',details}).success).toBe(false));
  it('does not repeat medical doses or measured values',()=>{
    for(const category of ['medicine','temperature','growth'] as const)expect(repeatDetails({category,details:{quantity:5,unit:'ml',medicineName:'Example'}}).quantity).toBeUndefined();
    expect(repeatDetails({category:'diaper',details:{diaperType:'mixed',diaperRash:true,pooAmount:'big'}})).toEqual({diaperType:'mixed'});
  });
  it('formats bottle and multi-symptom summaries from data',()=>{
    expect(eventSummary({category:'bottle',details:{quantity:8,unit:'oz',milkType:'cow milk'}})).toBe('8 oz cow milk bottle');
    expect(eventSummary({category:'symptom',details:{symptoms:[{name:'Cough',severity:'mild'},{name:'Runny nose'}]}})).toBe('Cough · mild + Runny nose');
  });
  it('validates library names, child scope, flags and unknown properties',()=>{
    expect(foodInputSchema.parse({name:'  Banana '})).toEqual({name:'Banana',childIds:[],active:true,favorite:false});
    expect(foodInputSchema.safeParse({name:' ',favorite:true}).success).toBe(false);
    expect(foodInputSchema.safeParse({name:'Banana',childIds:[input.childIds[0],input.childIds[0]]}).success).toBe(false);
  });
});
