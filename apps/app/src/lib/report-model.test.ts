import { describe, expect, it } from 'vitest';
import type { CareEvent, Child } from '@nestwise/shared';
import { dayStart, makeReport, reportHtml, reportRange } from './report-model';
const child = { id: 'c', firstName: 'River', dateOfBirth: '2026-01-01' } as Child;
const event = (patch: Partial<CareEvent> = {}): CareEvent => ({ id: 'e', householdId: 'h', childIds: ['c'], category: 'bottle', occurredAt: '2026-09-01T12:00:00Z', endedAt: null, notes: '', details: { quantity: 4, unit: 'oz' }, createdBy: 'u', createdByName: 'Parent', updatedBy: 'u', createdAt: '', updatedAt: '', version: 1, deletedAt: null, ...patch });
const build = (events: CareEvent[]) => makeReport(events, [child], '2026-09-01', '2026-09-01', 'UTC', ['sleep', 'feeding', 'temperature'], Date.parse('2026-09-03'));
describe('household calendar reporting', () => {
  it('handles 23 and 25 hour DST days and non-hour offsets', () => {
    for (const [day, hours] of [['2026-03-08', 23], ['2026-11-01', 25]] as const) {
      const range = reportRange(day, day, 'America/Chicago'); expect((range.end - range.start) / 3600000).toBe(hours);
    }
    expect(new Date(dayStart('2026-09-01', 'Asia/Kathmandu')).toISOString()).toBe('2026-08-31T18:15:00.000Z');
  });
  it('rejects invalid, reversed and unbounded ranges', () => {
    expect(() => reportRange('2026-02-30', '2026-03-01', 'UTC')).toThrow();
    expect(() => reportRange('2026-09-02', '2026-09-01', 'UTC')).toThrow();
    expect(() => reportRange('2020-01-01', '2026-09-01', 'UTC')).toThrow();
  });
  it('includes crossing sleep, unions overlaps and excludes deleted and future entries', () => {
    const report = build([event({ category: 'sleep', occurredAt: '2026-08-31T23:00:00Z', endedAt: '2026-09-01T02:00:00Z' }), event({ category: 'sleep', occurredAt: '2026-09-01T01:00:00Z', endedAt: '2026-09-01T03:00:00Z' }), event({ deletedAt: '2026-09-01' }), event({ occurredAt: '2026-09-02T00:00:00Z' })]);
    expect(report.logs).toHaveLength(2); expect(report.children[0].summaries[0].sleepHours).toBe(3);
  });
  it('separates units and does not total temperature observations', () => {
    const report = build([event(), event({ details: { quantity: 120, unit: 'ml' } }), event({ category: 'temperature', details: { quantity: 37, unit: 'C' } })]);
    expect(report.children[0].summaries[1].quantities.map(q => q.total)).toEqual([4, 120]);
    expect(report.children[0].summaries[2].quantities).toEqual([]);
  });
  it('escapes user content, omits private notes by default and honors selected sections', () => {
    const report = build([event({ notes: 'PRIVATE <script>alert(1)</script>', createdByName: '<img src=x onerror=alert(1)>' })]);
    expect(reportHtml(report, false)).not.toContain('PRIVATE');
    expect(reportHtml(report, true)).toContain('&lt;script&gt;');
    expect(reportHtml(report, true)).not.toContain('<img');
    expect(reportHtml(report, true, true)).toContain('may not yet be synchronized');
    expect(makeReport([event()], [child], '2026-09-01', '2026-09-01', 'UTC', ['sleep']).logs).toEqual([]);
  });
  it('counts shared logs once per child without duplicating the export source', () => {
    const report = makeReport([event({ childIds: ['c', 'd'] })], [child, { ...child, id: 'd' }], '2026-09-01', '2026-09-01', 'UTC', ['feeding']);
    expect(report.logs).toHaveLength(1); expect(report.children.map(c => c.summaries[0].count)).toEqual([1, 1]);
  });
});
