import { expect, it } from 'vitest';
import { predictRoutines } from './intelligence';
import type { CareEvent } from './index';
const now = new Date('2026-09-06T18:00:00Z');
function event(at: number, category: CareEvent['category'] = 'bottle', end?: number): CareEvent { return { id: String(at), householdId: 'h', childIds: ['c'], category, occurredAt: new Date(at).toISOString(), endedAt: end ? new Date(end).toISOString() : null, details: category === 'sleep' ? { sleepKind: 'nap' } : { quantity: 120, unit: 'ml' }, notes: '', createdBy: 'u', createdByName: 'Parent', updatedBy: 'u', createdAt: '', updatedAt: '', version: 1, deletedAt: null }; }
it('uses wake-to-nap history instead of counting sleep itself as awake time', () => {
  const history = Array.from({length: 7}, (_,i) => event(+now-(6-i)*3*3600000-3600000, 'sleep', +now-(6-i)*3*3600000));
  const p = predictRoutines(history, 'c', now).find(p=>p.type==='nap')!;
  expect(p.predictedAt).toBe('2026-09-06T20:00:00.000Z'); expect(p.explanation).toContain('wake-to-nap');
});
it('weights a recent feeding pattern more strongly than older observations', () => {
  const old = Array.from({length: 8}, (_,i) => event(+now-20*86400000+i*4*3600000));
  const recent = Array.from({length: 6}, (_,i) => event(+now-(5-i)*2*3600000));
  expect(predictRoutines([...old,...recent], 'c', now)[0].predictedAt).toBe('2026-09-06T20:00:00.000Z');
});
it('models bedtimes around midnight on the local clock and ignores daytime intervals', () => {
  const history = Array.from({length: 8}, (_,i) => ({ ...event(Date.parse('2026-09-06T04:00:00Z')-(7-i)*86400000, 'sleep', Date.parse('2026-09-06T12:00:00Z')-(7-i)*86400000), details: {sleepKind: 'night' as const} }));
  const p = predictRoutines(history, 'c', now, {timezone:'America/Chicago'}).find(p=>p.type==='bedtime')!;
  expect(p.predictedAt).toBe('2026-09-07T04:00:00.000Z'); expect(p.sampleCount).toBe(8);
});
it('abstains for ongoing sessions, future sessions, sparse data and stale patterns', () => {
  const history = Array.from({length: 6}, (_,i) => event(+now-(5-i)*3*3600000));
  expect(predictRoutines([...history,event(+now,'nursing')], 'c', now)).toEqual([]);
  expect(predictRoutines(history.map(e=>({...e,occurredAt:new Date(+now+3600000).toISOString()})), 'c', now)).toEqual([]);
  expect(predictRoutines(history.slice(0,2), 'c', now)).toEqual([]);
  expect(predictRoutines(history, 'c', new Date(+now+4*86400000))).toEqual([]);
});
it('reports drift only after enough observations and bounds confidence', () => {
  const history = Array.from({length: 12}, (_,i) => event(+now-(11-i)*2*3600000));
  const p = predictRoutines(history,'c',now)[0]; expect(p.driftMinutes).toBe(0); expect(p.confidence).toBeGreaterThan(0); expect(p.confidence).toBeLessThanOrEqual(.85);
});
