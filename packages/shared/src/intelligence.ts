import type { CareEvent, Prediction, SharedWindow } from './index';
const median = (values: number[]) => { const sorted = [...values].sort((a, b) => a - b); const middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2; };
const iso = (value: number) => new Date(value).toISOString();
/** Conservative rolling interval estimates. Never substitutes population schedules for actual logs. */
export function predictRoutines(events: CareEvent[], childId: string, now = new Date()): Prediction[] {
  const recent = events.filter(e => !e.deletedAt && e.childIds.includes(childId) && Date.parse(e.occurredAt) <= +now && Date.parse(e.occurredAt) >= +now - 14 * 86400000);
  const predictions: Prediction[] = [];
  for (const type of ['feeding', 'nap', 'bedtime'] as const) {
    const records = recent.filter(e => type === 'feeding' ? ['bottle', 'nursing', 'food'].includes(e.category) : e.category === 'sleep' && e.details.sleepKind === (type === 'nap' ? 'nap' : 'night')).sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));
    // An ongoing sleep/nursing timer cannot predict its own next session yet.
    if (records.some(e => ['sleep', 'nursing'].includes(e.category) && !e.endedAt)) continue;
    const intervals = records.slice(1).map((e, i) => (Date.parse(e.occurredAt) - Date.parse(records[i].occurredAt)) / 60000)
      .filter(n => type === 'bedtime' ? n >= 18 * 60 && n <= 30 * 60 : n >= 30 && n <= 8 * 60);
    if (intervals.length < 4) continue;
    const typical = median(intervals); const deviation = median(intervals.map(n => Math.abs(n - typical)));
    const predicted = Date.parse(records[records.length - 1].occurredAt) + typical * 60000;
    const spread = Math.max(15, deviation * 1.5) * 60000;
    if (predicted + spread < +now) continue;
    predictions.push({ childId, type, predictedAt: iso(predicted), windowStart: iso(predicted - spread), windowEnd: iso(predicted + spread),
      confidence: Math.min(0.85, intervals.length / 12) * Math.max(0.2, 1 - deviation / typical), sampleCount: intervals.length,
      explanation: `Based on ${intervals.length} recorded intervals over the last 14 days; typical spacing ${Math.round(typical)} minutes.`,
      driftMinutes: intervals.length >= 8 ? Math.round(median(intervals.slice(-4)) - median(intervals.slice(0, -4))) : null });
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
