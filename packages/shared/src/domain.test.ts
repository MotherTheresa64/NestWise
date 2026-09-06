import { describe, expect, it } from 'vitest';
import { eventInputSchema, parseLog, predictRoutines, sharedWindow, type CareEvent } from './index';
const childId = '11111111-1111-4111-8111-111111111111';
const secondId = '22222222-2222-4222-8222-222222222222';
const base = { id: childId, childIds: [childId], category: 'diaper', occurredAt: '2026-09-01T10:00:00Z' };
const now = new Date('2026-09-01T20:00:00Z');
function history(): CareEvent[] {
  return Array.from({ length: 6 }, (_, i) => ({ ...eventInputSchema.parse({ ...base, category: 'bottle', occurredAt: new Date(+now - (15 - i * 3) * 3600000).toISOString(), details: { quantity: 120, unit: 'ml' } }), id: String(i), householdId: childId, createdBy: childId, createdByName: 'Parent', updatedBy: childId, createdAt: base.occurredAt, updatedAt: base.occurredAt, version: 1, deletedAt: null }));
}
describe('care validation', () => {
  it('rejects reversed timers, duplicate children and foreign fields', () => {
    expect(eventInputSchema.safeParse({ ...base, category: 'sleep', endedAt: '2026-09-01T09:00:00Z' }).success).toBe(false);
    expect(eventInputSchema.safeParse({ ...base, childIds: [childId, childId] }).success).toBe(false);
    expect(eventInputSchema.safeParse({ ...base, householdId: secondId }).success).toBe(false);
  });
  it('requires units and medicine identity; rejects incompatible growth measurements', () => {
    expect(eventInputSchema.safeParse({ ...base, category: 'medicine', details: { quantity: 2, unit: 'ml' } }).success).toBe(false);
    expect(eventInputSchema.safeParse({ ...base, category: 'growth', details: { measurement: 'weight', quantity: 5, unit: 'cm' } }).success).toBe(false);
  });
});
describe('recorded routine estimates', () => {
  it('abstains with insufficient data and after estimates expire', () => {
    expect(predictRoutines(history().slice(0, 3), childId, now)).toEqual([]);
    expect(predictRoutines(history(), childId, new Date(+now + 86400000))).toEqual([]);
  });
  it('predicts from actual intervals and ignores deleted and other-child data', () => {
    const data = history(); const prediction = predictRoutines(data, childId, now)[0];
    expect(prediction.predictedAt).toBe('2026-09-01T23:00:00.000Z'); expect(prediction.sampleCount).toBe(5);
    expect(predictRoutines(data.map(e => ({ ...e, deletedAt: base.occurredAt })), childId, now)).toEqual([]);
    expect(predictRoutines(data, secondId, now)).toEqual([]);
  });
  it('only offers shared windows for distinct children and matching routine types', () => {
    const p = predictRoutines(history(), childId, now)[0];
    expect(sharedWindow([p, p])).toBeNull();
    expect(sharedWindow([p, { ...p, childId: secondId }])?.overlapStrength).toBe(1);
    expect(sharedWindow([p, { ...p, childId: secondId, windowStart: '2026-09-02T01:00:00Z', windowEnd: '2026-09-02T02:00:00Z' }])?.targetAt).toBeNull();
  });
});
it('parses explicit quick phrases without guessing medication or ambiguous times', () => {
  expect(parseLog('Bottle 120 ml')?.details.quantity).toBe(120);
  expect(parseLog('wet diaper')?.category).toBe('diaper');
  expect(parseLog('give medicine at 5')).toBeNull();
  expect(parseLog('bottle 120 ml yesterday')).toBeNull();
});
