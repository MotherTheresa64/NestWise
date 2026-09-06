import type { EventDetails, Category } from './index';
export type LogDraft = { category: Category; details: EventDetails; notes: string };
/** A deliberately small grammar: ambiguous text is rejected, and callers must confirm a draft. */
export function parseLog(text: string): LogDraft | null {
  const input = text.trim().toLowerCase();
  const bottle = input.match(/^bottle\s+(\d+(?:\.\d+)?)\s*(ml|oz)$/);
  if (bottle && Number(bottle[1]) > 0 && Number(bottle[1]) <= 100000) return { category: 'bottle', details: { quantity: Number(bottle[1]), unit: bottle[2] as 'ml' | 'oz' }, notes: '' };
  const diaper = input.match(/^(wet|dirty|mixed|dry)\s+diaper$/);
  if (diaper) return { category: 'diaper', details: { diaperType: diaper[1] as EventDetails['diaperType'] }, notes: '' };
  return null;
}
