import { expect, it } from 'vitest';
import { parseLog } from './natural';
const context = {now:new Date('2026-09-06T18:00:00Z'),children:[{id:'r',firstName:'River'},{id:'s',firstName:'Sage'}]};
it.each([
 ['nursed left for 15 minutes','nursing'],['pumped 90 ml','pumping'],['solids banana','food'],['water 20 ml','water'],['potty success','potty'],['medicine Example 2 ml','medicine'],['temperature 37 C forehead','temperature'],['symptom mild cough','symptom'],['weight 6 kg','growth'],['routine tummy time','routine'],['milestone rolled over','milestone'],['bath','bath'],['brushed teeth','teeth'],['note a happy afternoon','custom'],['nap for 1 hour','sleep']
])('parses %s as a proposed %s event', (phrase,category)=>{expect(parseLog(phrase,context)?.category).toBe(category);});
it('preserves children, duration, explicit time and notes',()=>{
 const p=parseLog('River and Sage: nursed both for 15 minutes 30 minutes ago; notes: Settled well',context)!;
 expect(p.childIds).toEqual(['r','s']);expect(p.occurredAt).toBe('2026-09-06T17:30:00.000Z');expect(p.endedAt).toBe('2026-09-06T17:45:00.000Z');expect(p.notes).toBe('Settled well');
 expect(parseLog('bottle 120 ml at 2026-09-06T12:00-05:00',context)?.occurredAt).toBe('2026-09-06T17:00:00.000Z');
});
it.each(['Unknown: bottle 10 ml','River and River: wet diaper','medicine at 5','nap for 5000 minutes','bottle -10 ml','weight 5 cm','bottle 120 ml yesterday','bottle 120 ml at 5','bottle 10 ml for 2 minutes'])('rejects ambiguity or invalid values: %s',phrase=>expect(parseLog(phrase,context)).toBeNull());
it('reads explicit AM/PM times in the supplied timezone and rejects impossible DST times',()=>{
 expect(parseLog('wet diaper at 10 am',{...context,timezone:'America/Chicago'})?.occurredAt).toBe('2026-09-06T15:00:00.000Z');
 expect(parseLog('wet diaper yesterday at 10 am',{...context,timezone:'America/Chicago'})?.occurredAt).toBe('2026-09-05T15:00:00.000Z');
 expect(parseLog('wet diaper at 25 pm',context)).toBeNull();
 expect(parseLog('wet diaper at 2:30 am',{...context,now:new Date('2026-03-08T18:00:00Z'),timezone:'America/Chicago'})).toBeNull();
});
it.each(['River had a 4 oz bottle','River drank 4 oz','River and Sage had bottle 120 ml','River weighed 6 kg'])('recognizes explicit named-subject care phrases: %s',phrase=>expect(parseLog(phrase,context)?.childIds).toContain('r'));
