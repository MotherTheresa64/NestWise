import { eventSummary, type CareEvent, type Child } from '@nestwise/shared';
import { careBreakdown } from './care-statistics';
import { sleepHours } from './report';

export const reportSections = ['sleep', 'feeding', 'diapers', 'medicine', 'symptoms', 'temperature', 'growth', 'routines'] as const;
export type ReportSection = typeof reportSections[number];
const categories: Record<ReportSection, string[]> = { sleep: ['sleep'], feeding: ['bottle', 'nursing', 'pumping', 'food', 'water'], diapers: ['diaper', 'potty'], medicine: ['medicine'], symptoms: ['symptom'], temperature: ['temperature'], growth: ['growth'], routines: ['routine', 'bath', 'teeth', 'milestone', 'custom'] };
export const reportDisclaimer = 'This report contains caregiver-entered information. NestWise is not a medical record, diagnosis, or substitute for professional medical care. Missing entries do not mean care did not occur.';
const dateFormatters = new Map<string, Intl.DateTimeFormat>();
const boundaries = new Map<string, number>();
export function localDay(time: number, timezone: string): string {
  let formatter = dateFormatters.get(timezone); if (!formatter) { formatter = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }); if (dateFormatters.size >= 64) dateFormatters.clear(); dateFormatters.set(timezone, formatter); }
  const p = formatter.formatToParts(time);
  return ['year', 'month', 'day'].map(type => p.find(v => v.type === type)!.value).join('-');
}
export function shiftDay(day: string, days: number): string { return new Date(Date.parse(`${day}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10); }
/** Find the first instant in a household calendar date, including DST transitions. */
export function dayStart(day: string, timezone: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(day)) || new Date(day).toISOString().slice(0, 10) !== day) throw new Error('Choose a valid date (YYYY-MM-DD).');
  const key = timezone + '/' + day; const saved = boundaries.get(key); if (saved !== undefined) return saved;
  let low = Date.parse(day) - 36 * 3600000; let high = Date.parse(day) + 36 * 3600000;
  while (high - low > 1) { const middle = Math.floor((low + high) / 2); if (localDay(middle, timezone) < day) low = middle; else high = middle; }
  if (boundaries.size >= 2048) boundaries.clear(); boundaries.set(key, high);
  return high;
}
export function reportRange(from: string, through: string, timezone: string) {
  const start = dayStart(from, timezone); const end = dayStart(shiftDay(through, 1), timezone);
  dayStart(through, timezone);
  if (end <= start) throw new Error('End date must be on or after the start date.');
  if (end - start > 367 * 86400000) throw new Error('Choose a range of up to one year.');
  return { start, end };
}
export function makeReport(events: CareEvent[], children: Child[], from: string, through: string, timezone: string, sections: ReportSection[], now = Date.now()) {
  const { start, end } = reportRange(from, through, timezone); const cutoff = Math.min(end, now);
  const selected = new Set(sections.flatMap(s => categories[s]));
  const logs = events.filter(e => !e.deletedAt && selected.has(e.category) && e.childIds.some(id => children.some(c => c.id === id)) && Date.parse(e.occurredAt) < cutoff && (Date.parse(e.occurredAt) >= start || (e.category === 'sleep' && e.endedAt && Date.parse(e.endedAt) > start)));
  const days: string[] = []; for (let day = from; day <= through; day = shiftDay(day, 1)) days.push(day);
  return { from, through, timezone, sections, generatedAt: now, logs, children: children.map(child => {
    const own = logs.filter(e => e.childIds.includes(child.id));
    return { child, summaries: sections.map(section => {
      const records = own.filter(e => categories[section].includes(e.category));
      const quantities = new Map<string, number>();
      // Keep different substances, measurements and units separate. Temperature/growth are observations, never totals.
      if (section === 'feeding' || section === 'medicine') for (const e of records) if (e.details.quantity !== undefined && e.details.unit) { const key = `${e.category} ${e.details.medicineName || (e.details.milkType==='other'?e.details.liquidName:e.details.milkType) || ''} (${e.details.unit})`.replace('  ', ' '); quantities.set(key, (quantities.get(key) || 0) + e.details.quantity); }
      const observations = [...new Set(records.filter(e => e.details.quantity !== undefined && e.details.unit).map(e => `${e.details.measurement || e.category} (${e.details.unit})`))].map(label => { const values = records.filter(e => `${e.details.measurement || e.category} (${e.details.unit})` === label && e.details.quantity !== undefined).map(e => e.details.quantity!); return {label, min: Math.min(...values), max: Math.max(...values)}; });
      return { section, breakdown:careBreakdown(records), observations, count: records.length, sleepHours: section === 'sleep' ? sleepHours(own, child.id, start, cutoff) : null, quantities: [...quantities].map(([label, total]) => ({ label, total })), records };
    }), days: days.map(day => { const a = dayStart(day, timezone); const b = Math.min(dayStart(shiftDay(day, 1), timezone), cutoff); return { day, sectionCounts: Object.fromEntries(sections.map(section => [section, own.filter(e => categories[section].includes(e.category) && Date.parse(e.occurredAt) >= a && Date.parse(e.occurredAt) < b).length])) as Partial<Record<ReportSection, number>>, count: own.filter(e => Date.parse(e.occurredAt) >= a && Date.parse(e.occurredAt) < b).length, sleep: sections.includes('sleep') ? sleepHours(own, child.id, a, b) : 0 }; }) }; }) };
}
export type CareReport = ReturnType<typeof makeReport>;
const html = (value: unknown) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
export function reportHtml(report: CareReport, includeNotes: boolean, pending = false): string {
  const date = (s: string) => new Date(s).toLocaleString('en-US', { timeZone: report.timezone });
  return `<!doctype html><html><head><meta charset="utf-8"><title>NestWise care report</title><style>@page{size:A4;margin:18mm;@bottom-left{content:"NestWise | Caregiver-entered information";font:9px Arial;color:#59665d}@bottom-right{content:"Page " counter(page) " of " counter(pages);font:9px Arial;color:#59665d}}body{font:12px/1.5 Arial,sans-serif;color:#233e35}h1{font-size:28px;margin-bottom:4px}h2{font-size:22px;border-bottom:2px solid #b6c797;padding-bottom:8px}h3{text-transform:capitalize;font-size:16px}aside{background:#eff2e8;padding:14px;border-radius:8px}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{text-align:left;vertical-align:top;padding:8px;border-bottom:1px solid #ddd;overflow-wrap:anywhere}th:first-child{width:24%}thead{display:table-header-group}tr{break-inside:avoid}h2,h3{break-after:avoid}.child+.child{break-before:page}.muted{color:#59665d}p{overflow-wrap:anywhere}</style></head><body><h1>NestWise</h1><p>Care summary · ${html(report.from)} through ${html(report.through)}<br>Household timezone: ${html(report.timezone)}<br>Prepared ${html(date(new Date(report.generatedAt).toISOString()))}</p><aside>${html(reportDisclaimer)}${pending ? '<p><strong>Includes local changes that may not yet be synchronized. Resolve conflicts before relying on this export.</strong></p>' : ''}</aside><p>Children: ${report.children.map(c => html(c.child.firstName)).join(', ')}. Shared events appear once for each selected child. Sleep is clipped to the period and overlapping sessions are counted once. Active sleep timers are excluded from sleep duration. Notes ${includeNotes ? 'included' : 'excluded'}.</p>${report.children.map(({ child, summaries }) => `<section class="child"><h2>${html(child.firstName)}</h2><p>Date of birth: ${html(child.dateOfBirth)}</p>${summaries.map(s => `<h3>${html(s.section)}</h3><p>${s.count} recorded entries${s.sleepHours !== null ? ` · ${s.sleepHours.toFixed(1)} hours of completed sleep` : ''}${s.quantities.map(q => ` · ${html(q.label)}: ${q.total.toFixed(1)}`).join('')}</p>${s.records.length ? `<table><thead><tr><th>When</th><th>Recorded care</th></tr></thead><tbody>${[...s.records].sort((a,b) => a.occurredAt.localeCompare(b.occurredAt)).map(e => `<tr><td>${html(date(e.occurredAt))}${e.endedAt ? `<br>to ${html(date(e.endedAt))}` : ''}</td><td><strong>${html(e.category)}</strong><br>${html(eventSummary(e))}<br>${Object.entries(e.details).map(([k,v]) => `${html(k.replace(/([A-Z])/g, ' $1'))}: ${html(typeof v === 'object' ? JSON.stringify(v) : v)}`).join(' · ')}${includeNotes && e.notes ? `<p>${html(e.notes)}</p>` : ''}<br><span class="muted">Entered by ${html(e.createdByName)}</span></td></tr>`).join('')}</tbody></table>` : '<p class="muted">No entries recorded in this period.</p>'}`).join('')}</section>`).join('')}</body></html>`;
}
