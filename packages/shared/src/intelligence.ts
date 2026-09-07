import type { CareEvent, Prediction, SharedWindow } from './index';
type Sample = { value: number; at: number };
const iso = (value: number) => new Date(value).toISOString();
const median = (values: number[]) => { const sorted = [...values].sort((a,b) => a-b); return sorted[Math.floor(sorted.length / 2)]; };
const weighted = (samples: Sample[], now: number, halfLife: number) => {
  const sorted = samples.map(s => ({ ...s, weight: 2 ** (-(now - s.at) / halfLife) })).sort((a,b) => a.value-b.value);
  const total = sorted.reduce((sum,s) => sum+s.weight,0); let running = 0;
  return sorted.find(s => { running += s.weight; return running >= total / 2; })!.value;
};
const localParts = (time: number, timezone: string) => {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(time);
  const part = (type: string) => Number(parts.find(p => p.type === type)!.value);
  return { day: `${part('year')}-${part('month')}-${part('day')}`, minute: part('hour') * 60 + part('minute') };
};
/** Describe this child's observations only. Age changes recency weighting, never supplies a care schedule. */
export function predictRoutines(events: CareEvent[], childId: string, now = new Date(), options: { timezone?: string; dateOfBirth?: string } = {}): Prediction[] {
  const timezone = options.timezone || 'UTC'; const clock = +now;
  const ageDays = options.dateOfBirth ? Math.max(0, (clock - Date.parse(options.dateOfBirth)) / 86400000) : 365;
  const halfLife = (ageDays < 90 ? 3 : 7) * 86400000;
  const recent = events.filter(e => !e.deletedAt && e.childIds.includes(childId) && Number.isFinite(Date.parse(e.occurredAt)) && Date.parse(e.occurredAt) <= clock && Date.parse(e.occurredAt) >= clock - 28 * 86400000).sort((a,b) => Date.parse(a.occurredAt)-Date.parse(b.occurredAt));
  const predictions: Prediction[] = [];
  for (const type of ['feeding', 'nap', 'bedtime'] as const) {
    const records = recent.filter(e => type === 'feeding' ? ['bottle', 'nursing', 'food'].includes(e.category) : e.category === 'sleep' && e.details.sleepKind === (type === 'nap' ? 'nap' : 'night'));
    if (type !== 'feeding' && recent.some(e => e.category === 'sleep' && (!e.endedAt || Date.parse(e.endedAt) > clock))) continue;
    if (!records.length || records.some(e => ['sleep','nursing'].includes(e.category) && (!e.endedAt || Date.parse(e.endedAt) > clock))) continue;
    const last = records[records.length-1]; let samples: Sample[] = []; let anchor = Date.parse(last.occurredAt); let method = 'start-to-start intervals';
    if (type === 'bedtime') {
      // One observation per local date; unwrap the clock at noon so midnight is not a discontinuity.
      const nights = new Map<string, Sample>();
      for (const e of records) { const at = Date.parse(e.occurredAt); const local = localParts(at, timezone); if (!nights.has(local.day)) nights.set(local.day, { value: local.minute < 720 ? local.minute + 1440 : local.minute, at }); }
      samples = [...nights.values()]; method = 'household-local bedtime observations';
    } else if (type === 'nap') {
      const sleeps = recent.filter(e => e.category === 'sleep' && e.endedAt && Date.parse(e.endedAt) <= clock);
      for (const e of records) { const start = Date.parse(e.occurredAt); const prior = sleeps.filter(s => Date.parse(s.endedAt!) <= start && s.id !== e.id).sort((a,b) => Date.parse(b.endedAt!)-Date.parse(a.endedAt!))[0]; if (prior) samples.push({ value: (start-Date.parse(prior.endedAt!))/60000, at: start }); }
      const wake = sleeps.sort((a,b) => Date.parse(b.endedAt!)-Date.parse(a.endedAt!))[0]; if (!wake) continue;
      anchor = Date.parse(wake.endedAt!); method = 'recorded wake-to-nap intervals';
    } else samples = records.slice(1).map((e,i) => ({ value: (Date.parse(e.occurredAt)-Date.parse(records[i].occurredAt))/60000, at: Date.parse(e.occurredAt) }));
    samples = samples.filter(s => Number.isFinite(s.value) && (type === 'bedtime' || (s.value >= 30 && s.value <= 480)));
    if (samples.length < (type === 'bedtime' ? 5 : 4)) continue;
    const typical = weighted(samples, clock, halfLife);
    const deviation = weighted(samples.map(s => ({ ...s, value: Math.abs(s.value-typical) })), clock, halfLife);
    let predicted = anchor + typical * 60000;
    if (type === 'bedtime') {
      const targetMinute = typical % 1440; const currentMinute = localParts(clock, timezone).minute;
      predicted = clock - (clock % 60000) + (targetMinute-currentMinute) * 60000;
      // Correct offsets across a daylight-saving transition without assuming a 24-hour local day.
      for (let i=0;i<3;i++) { let delta = targetMinute-localParts(predicted, timezone).minute; if (delta>720) delta-=1440; if (delta< -720) delta+=1440; predicted += delta*60000; }
      if (predicted <= Date.parse(last.occurredAt)) { predicted += 86400000; let delta=targetMinute-localParts(predicted,timezone).minute; if(delta>720)delta-=1440; if(delta< -720)delta+=1440; predicted+=delta*60000; }
    }
    const spread = Math.max(15, deviation * 1.5) * 60000;
    if (predicted + spread < clock || predicted > clock + 30 * 3600000 || clock-Date.parse(last.occurredAt)>3*86400000) continue;
    const consistency = Math.max(0.15, 1-deviation/(type === 'bedtime' ? 180 : typical));
    const confidence = Math.min(0.85, samples.length/12) * consistency * Math.max(0.25, 2 ** (-(clock-samples[samples.length-1].at)/(7*86400000)));
    predictions.push({ childId, type, predictedAt: iso(predicted), windowStart: iso(predicted-spread), windowEnd: iso(predicted+spread), confidence, sampleCount: samples.length, ...(type === 'nap' ? { typicalDurationMinutes: median(records.filter(e=>e.endedAt && Date.parse(e.endedAt)>Date.parse(e.occurredAt)).map(e=>(Date.parse(e.endedAt!)-Date.parse(e.occurredAt))/60000)) } : {}),
      explanation: `Based on ${samples.length} ${method} over the last 28 days, weighted toward recent care. The range describes variability, not a medical recommendation.`,
      driftMinutes: samples.length >= 8 ? Math.round(median(samples.slice(-4).map(s=>s.value))-median(samples.slice(0,-4).map(s=>s.value))) : null });
  }
  return predictions;
}
export function sharedWindow(predictions: Prediction[]): SharedWindow | null {
  if (predictions.length < 2 || new Set(predictions.map(p => p.childId)).size !== predictions.length || new Set(predictions.map(p => p.type)).size !== 1) return null;
  const start = Math.max(...predictions.map(p => Date.parse(p.windowStart)));
  const end = Math.min(...predictions.map(p => Date.parse(p.windowEnd)));
  const union = Math.max(...predictions.map(p => Date.parse(p.windowEnd))) - Math.min(...predictions.map(p => Date.parse(p.windowStart)));
  return { childIds: predictions.map(p => p.childId), targetAt: start <= end ? iso((start + end) / 2) : null,
    windowStart: start <= end ? iso(start) : null, windowEnd: start <= end ? iso(end) : null,
    overlapStrength: start <= end ? (end - start) / Math.max(1, union) : 0,
    explanation: start <= end ? 'Recorded patterns suggest an overlapping window. Follow each child’s cues.' : 'The recorded patterns do not currently overlap.' };
}
