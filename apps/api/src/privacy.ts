import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type pg from 'pg';
import { z } from 'zod';
import { idSchema, type User } from '@nestwise/shared';
/** Exports use one consistent database view; authentication material is never selected. */
export function registerPrivacyRoutes(app: FastifyInstance, pool: pg.Pool, userFor: (r: FastifyRequest)=>Promise<User>) {
  const fail = (statusCode: number,message: string): never => {throw Object.assign(new Error(message),{statusCode});};
  async function checkSession(client: pg.PoolClient, request: FastifyRequest, user: User) {
    const token=request.headers.authorization!.slice(7);
    if(!(await client.query('SELECT 1 FROM sessions WHERE user_id=$1 AND token_hash=$2 AND expires_at>now()', [user.id,createHash('sha256').update(token).digest('hex')])).rowCount)fail(401,'Your session has expired.');
  }
  async function household(client: pg.PoolClient, id: string, userId: string) {
    const h=(await client.query('SELECT h.*,m.role FROM households h JOIN members m ON m.household_id=h.id WHERE h.id=$1 AND m.user_id=$2',[id,userId])).rows[0];
    if(!h) fail(404,'Household not found.');
    const children=(await client.query('SELECT id,data,created_at,version FROM children WHERE household_id=$1',[id])).rows;
    const events=(await client.query('SELECT data FROM events WHERE household_id=$1',[id])).rows.map(r=>r.data);
    const reminders=(await client.query('SELECT data FROM reminders WHERE household_id=$1',[id])).rows.map(r=>r.data);
    const foods=(await client.query('SELECT data FROM foods WHERE household_id=$1',[id])).rows.map(r=>r.data);
    const members=(await client.query('SELECT u.id,u.name,u.email,m.role FROM members m JOIN users u ON u.id=m.user_id WHERE m.household_id=$1',[id])).rows;
    const invitations=['owner','admin'].includes(h.role)?(await client.query('SELECT id,email,role,expires_at FROM invitations WHERE household_id=$1',[id])).rows:[];
    const audit=['owner','admin'].includes(h.role)?(await client.query('SELECT id,user_id,action,entity_id,created_at FROM audit WHERE household_id=$1 ORDER BY id',[id])).rows:[];
    return {household:h,children,events,reminders,foods,members,invitations,audit};
  }
  for(const scope of ['user','household'] as const) app.get(scope==='user'?'/auth/export':'/households/:householdId/export',async(request,reply)=>{
    const user=await userFor(request); const client=await pool.connect();
    try {await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
      const ids=scope==='household'?[z.object({householdId:idSchema}).parse(request.params).householdId]:(await client.query('SELECT household_id FROM members WHERE user_id=$1',[user.id])).rows.map(r=>r.household_id as string);
      const households=[];for(const id of ids) households.push(await household(client,id,user.id));
      const account=(await client.query('SELECT id,email,name,created_at,verified_at FROM users WHERE id=$1',[user.id])).rows[0];
      const sessions=(await client.query('SELECT id,created_at,expires_at FROM sessions WHERE user_id=$1',[user.id])).rows;
      await client.query('COMMIT');reply.header('Cache-Control','no-store');return {format:'nestwise-data-export-v1',exportedAt:new Date().toISOString(),user:account,sessions,households};
    } catch(error) {await client.query('ROLLBACK');throw error;} finally {client.release();}
  });
  app.delete('/households/:householdId/children/:childId',async request=>{
    const user=await userFor(request);const {householdId,childId}=z.object({householdId:idSchema,childId:idSchema}).parse(request.params);
    const {baseVersion}=z.object({confirmation:z.literal('DELETE CHILD'),baseVersion:z.number().int().positive()}).strict().parse(request.body);const client=await pool.connect();
    try {await client.query('BEGIN');await client.query('SELECT id FROM households WHERE id=$1 FOR UPDATE',[householdId]);
      const role=(await client.query('SELECT role FROM members WHERE household_id=$1 AND user_id=$2',[householdId,user.id])).rows[0]?.role;
      if(role!=='owner')fail(403,'Only the current owner can permanently delete a child.');
      const child=(await client.query('SELECT version FROM children WHERE id=$1 AND household_id=$2',[childId,householdId])).rows[0];
      if(!child)fail(404,'Child not found.');if(child.version!==baseVersion)fail(409,'This child changed. Refresh and review before deleting.');
      await checkSession(client,request,user);
      const foodIds=(await client.query("SELECT id FROM foods WHERE household_id=$1 AND data->'childIds' ? $2 UNION SELECT entity_id FROM changes WHERE household_id=$1 AND kind='foods' AND record->'childIds' ? $2",[householdId,childId])).rows.map(r=>r.id);
      for(const id of foodIds) await client.query('INSERT INTO erased_foods VALUES($1,$2) ON CONFLICT DO NOTHING',[householdId,id]);
      await client.query("DELETE FROM mutation_receipts WHERE household_id=$1 AND input->>'foodId'=ANY($2::text[])",[householdId,foodIds]);
      await client.query("UPDATE changes SET record=NULL WHERE household_id=$1 AND kind='foods' AND entity_id=ANY($2::uuid[])",[householdId,foodIds]);
      await client.query('DELETE FROM foods WHERE household_id=$1 AND id=ANY($2::uuid[])',[householdId,foodIds]);
      const ids=(await client.query("SELECT id FROM events WHERE household_id=$1 AND data->'childIds' ? $2 UNION SELECT entity_id AS id FROM changes WHERE household_id=$1 AND kind='events' AND record->'childIds' ? $2 UNION SELECT (input->>'eventId')::uuid AS id FROM mutation_receipts WHERE household_id=$1 AND (input->'event'->'childIds' ? $2 OR result->'event'->'childIds' ? $2)",[householdId,childId])).rows.map(r=>r.id);
      for(const id of ids)await client.query('INSERT INTO erased_events VALUES($1,$2) ON CONFLICT DO NOTHING',[householdId,id]);
      await client.query("DELETE FROM mutation_receipts WHERE household_id=$1 AND input->>'eventId'=ANY($2::text[])",[householdId,ids]);
      await client.query("UPDATE changes SET record=NULL WHERE household_id=$1 AND (entity_id=$2 OR (kind IN ('events','reminders') AND record->'childIds' ? $3) OR (kind='events' AND entity_id=ANY($4::uuid[])))",[householdId,childId,childId,ids]);
      await client.query('DELETE FROM events WHERE household_id=$1 AND id=ANY($2::uuid[])',[householdId,ids]);
      await client.query("DELETE FROM reminders WHERE household_id=$1 AND data->'childIds' ? $2",[householdId,childId]);
      await client.query('DELETE FROM children WHERE household_id=$1 AND id=$2',[householdId,childId]);
      await client.query("INSERT INTO audit(household_id,user_id,action,entity_id) VALUES($1,$2,'child.erase',$3)",[householdId,user.id,childId]);
      await client.query('COMMIT');return {ok:true};
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  });
  app.delete('/households/:householdId',async request=>{
    const user=await userFor(request);const {householdId}=z.object({householdId:idSchema}).parse(request.params);
    z.object({confirmation:z.literal('DELETE HOUSEHOLD')}).strict().parse(request.body); const client=await pool.connect();
    try {await client.query('BEGIN');await client.query('SELECT id FROM households WHERE id=$1 FOR UPDATE',[householdId]);
      const role=(await client.query('SELECT role FROM members WHERE household_id=$1 AND user_id=$2',[householdId,user.id])).rows[0]?.role;
      if(role!=='owner') fail(403,'Only the current owner can delete this household.');
      // Recheck the session after acquiring the same household lock used by sync and ownership transfer.
      await checkSession(client,request,user);
      await client.query('DELETE FROM households WHERE id=$1',[householdId]);await client.query("SELECT pg_notify('nestwise_changes',$1)",[householdId]);await client.query('COMMIT');return {ok:true};
    } catch(error) {await client.query('ROLLBACK');throw error;} finally {client.release();}
  });
}
