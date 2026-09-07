import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {buildApi} from './app';
import {migrate} from './migrate';
const url=process.env.TEST_DATABASE_URL;
describe.skipIf(!url)('shared food catalog and rich care synchronization',()=>{
  const schema=`food_${randomUUID().replaceAll('-','')}`;const admin=new pg.Pool({connectionString:url});const pool=new pg.Pool({connectionString:url,options:`-c search_path=${schema}`});let app:Awaited<ReturnType<typeof buildApi>>;
  const call=(path:string,token:string,body?:unknown,method=body?'POST':'GET')=>app.inject({method:method as 'GET'|'POST'|'DELETE',url:path,headers:{authorization:`Bearer ${token}`},...(body?{payload:body as Record<string,unknown>}:{})});
  const register=async()=> (await app.inject({method:'POST',url:'/auth/register',payload:{name:'Fictional caregiver',email:`${randomUUID()}@food.test`,password:'test passphrase long enough'}})).json();
  beforeAll(async()=>{await admin.query(`CREATE SCHEMA ${schema}`);await migrate(pool);app=await buildApi(pool);});
  afterAll(async()=>{await app.close();await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();});
  it('isolates catalog data, handles replay/stale edits and emits incremental changes',async()=>{
    const owner=await register(),other=await register();const h=(await call('/households',owner.token,{name:'Food family',timezone:'UTC'})).json();const path=`/households/${h.id}`;
    const mutation={mutationId:randomUUID(),foodId:randomUUID(),baseVersion:0,food:{name:'Banana',childIds:[],active:true,favorite:true}};
    expect((await call(path+'/foods/sync',other.token,mutation)).statusCode).toBe(403);
    const created=await call(path+'/foods/sync',owner.token,mutation);expect(created.statusCode).toBe(200);expect((await call(path+'/foods/sync',owner.token,mutation)).json()).toEqual(created.json());
    expect((await call(path+'/snapshot',owner.token)).json().foods).toHaveLength(1);
    expect((await call(path+'/changes?after=0&includeFoods=1',owner.token)).json().changes.some((c:{kind:string})=>c.kind==='foods')).toBe(true);
    const legacy=(await call(path+'/changes?after=0',owner.token)).json().changes;expect(legacy.every((c:{kind:string})=>c.kind!=='foods')).toBe(true);expect(legacy.some((c:{entityId:string;record:unknown})=>c.entityId.startsWith('catalog:') && c.record===null)).toBe(true);
    const update={...mutation,mutationId:randomUUID(),baseVersion:1,food:{...mutation.food,name:'Ripe banana'}};
    expect((await call(path+'/foods/sync',owner.token,update)).json().food.version).toBe(2);
    const conflict=(await call(path+'/foods/sync',owner.token,{...update,mutationId:randomUUID(),food:{...update.food,name:'Stale banana'}})).json();expect(conflict.status).toBe('conflict');expect(conflict.food.name).toBe('Ripe banana');
    expect((await call(path+'/foods/sync',owner.token,{...mutation,food:{...mutation.food,name:'Changed retry'}})).statusCode).toBe(409);
    await pool.query('INSERT INTO members VALUES($1,$2,$3)',[h.id,other.user.id,'viewer']);
    expect((await call(path+'/foods/sync',other.token,{...mutation,mutationId:randomUUID(),foodId:randomUUID()})).statusCode).toBe(403);
    expect((await call(path+'/export',owner.token)).json().households[0].foods[0].name).toBe('Ripe banana');
  });
  it('preserves multi-child meal details through mutation replay and conflicts',async()=>{
    const owner=await register();const h=(await call('/households',owner.token,{name:'Siblings',timezone:'UTC'})).json();const path=`/households/${h.id}`;
    const ids=[];for(const firstName of ['River','Sage'])ids.push((await call(path+'/children',owner.token,{firstName,dateOfBirth:'2026-01-01'})).json().id);
    const id=randomUUID();const mutation={mutationId:randomUUID(),eventId:id,baseVersion:0,operation:'create',event:{id,childIds:ids,category:'food',occurredAt:new Date().toISOString(),details:{foods:[{name:'Oatmeal',amount:2,unit:'tbsp',preference:'liked'},{name:'Banana',sensitivityObserved:true,observation:'Caregiver observed a red patch'}]}}};
    const created=await call(path+'/sync',owner.token,[mutation]);expect(created.statusCode).toBe(200);expect((await call(path+'/sync',owner.token,[mutation])).json()).toEqual(created.json());
    const event=(await call(path+'/snapshot',owner.token)).json().events[0];expect(event.details).toEqual(mutation.event.details);expect(event.childIds).toEqual(ids);
    expect((await call(path+'/sync',owner.token,[{...mutation,mutationId:randomUUID(),operation:'update',baseVersion:0}])).json()[0].status).toBe('conflict');
  });
  it('erases child-scoped foods and prevents replay resurrection',async()=>{
    const owner=await register();const h=(await call('/households',owner.token,{name:'Erasure',timezone:'UTC'})).json();const path=`/households/${h.id}`;
    const child=(await call(path+'/children',owner.token,{firstName:'Child',dateOfBirth:'2026-01-01'})).json();
    const mutation={mutationId:randomUUID(),foodId:randomUUID(),baseVersion:0,food:{name:'Private custom food',childIds:[child.id],active:true,favorite:false}};
    expect((await call(path+'/foods/sync',owner.token,mutation)).statusCode).toBe(200);
    expect((await call(path+'/children/'+child.id,owner.token,{confirmation:'DELETE CHILD',baseVersion:1},'DELETE')).statusCode).toBe(200);
    expect((await call(path+'/snapshot',owner.token)).json().foods).toEqual([]);
    expect((await call(path+'/foods/sync',owner.token,mutation)).statusCode).toBe(409);
    expect(JSON.stringify((await pool.query('SELECT record FROM changes WHERE household_id=$1',[h.id])).rows)).not.toContain('Private custom food');
  });
});
