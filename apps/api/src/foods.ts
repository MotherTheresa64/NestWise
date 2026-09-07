import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type pg from 'pg';
import { canWrite, foodMutationSchema, idSchema, type CatalogFood, type User } from '@nestwise/shared';
import { z } from 'zod';
export function registerFoodRoutes(app: FastifyInstance, pool: pg.Pool, userFor: (r: FastifyRequest)=>Promise<User>) {
  app.post('/households/:householdId/foods/sync', async request => {
    const user = await userFor(request); const {householdId}=z.object({householdId:idSchema}).parse(request.params);
    const mutation=foodMutationSchema.parse(request.body); const client=await pool.connect();
    const fail=(statusCode:number,message:string):never=>{throw Object.assign(new Error(message),{statusCode});};
    try {
      await client.query('BEGIN'); await client.query('SELECT id FROM households WHERE id=$1 FOR UPDATE',[householdId]);
      const access=(await client.query('SELECT m.role FROM members m JOIN sessions s ON s.user_id=m.user_id WHERE m.household_id=$1 AND m.user_id=$2 AND s.token_hash=$3 AND s.expires_at>now()',[householdId,user.id,createHash('sha256').update(request.headers.authorization!.slice(7)).digest('hex')])).rows[0];
      if(!access || !canWrite(access.role)) fail(403,'Your role does not allow food catalog changes.');
      if((await client.query('SELECT 1 FROM erased_foods WHERE household_id=$1 AND food_id=$2',[householdId,mutation.foodId])).rowCount) fail(409,'This food was erased with a child. Your pending edit remains available for review.');
      const receipt=(await client.query('SELECT * FROM mutation_receipts WHERE household_id=$1 AND mutation_id=$2',[householdId,mutation.mutationId])).rows[0];
      if(receipt) {
        const same=(await client.query('SELECT $1::jsonb=$2::jsonb AS same',[receipt.input,mutation])).rows[0].same;
        if(receipt.user_id!==user.id || !same) fail(409,'Mutation ID was already used.');
        await client.query('COMMIT'); return receipt.result;
      }
      const children=await client.query('SELECT id FROM children WHERE household_id=$1 AND id=ANY($2::uuid[])',[householdId,mutation.food.childIds]);
      if(children.rowCount!==mutation.food.childIds.length) fail(400,'Every selected child must belong to this household.');
      const existing=(await client.query('SELECT data FROM foods WHERE household_id=$1 AND id=$2',[householdId,mutation.foodId])).rows[0]?.data as CatalogFood | undefined;
      const conflict=(existing?.version || 0)!==mutation.baseVersion;
      const food=conflict ? existing || null : {...mutation.food,id:mutation.foodId,householdId,version:mutation.baseVersion+1};
      if(!conflict) {
        if(existing) await client.query('UPDATE foods SET data=$1 WHERE id=$2 AND household_id=$3',[food,mutation.foodId,householdId]);
        else await client.query('INSERT INTO foods VALUES($1,$2,$3)',[mutation.foodId,householdId,food]);
        await client.query('INSERT INTO audit(household_id,user_id,action,entity_id) VALUES($1,$2,$3,$4)',[householdId,user.id,'food-edit',mutation.foodId]);
      }
      const result={mutationId:mutation.mutationId,status:conflict?'conflict':'applied',food};
      await client.query('INSERT INTO mutation_receipts VALUES($1,$2,$3,$4,$5)',[householdId,mutation.mutationId,user.id,mutation,result]);
      await client.query('COMMIT'); return result;
    } catch(error){await client.query('ROLLBACK');throw error;} finally{client.release();}
  });
}
