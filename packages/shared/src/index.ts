import { z } from 'zod';
export { predictRoutines, sharedWindow } from './intelligence';
export { parseLog } from './natural';

export const categories = ['sleep', 'nursing', 'bottle', 'pumping', 'food', 'water', 'diaper', 'potty', 'medicine', 'temperature', 'symptom', 'growth', 'teeth', 'bath', 'routine', 'milestone', 'custom'] as const;
export const categorySchema = z.enum(categories);
export type Category = z.infer<typeof categorySchema>;
export const roles = ['owner', 'admin', 'caregiver', 'viewer'] as const;
export type Role = typeof roles[number];
export const roleSchema = z.enum(roles);
export const idSchema = z.string().uuid();
export const dateTimeSchema = z.string().datetime({ offset: true });
export const timezoneSchema = z.string().max(100).refine(value => {
  try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; }
}, 'Choose a valid IANA timezone');
export const detailsSchema = z.object({
  quantity: z.number().finite().min(0).max(100000).optional(),
  unit: z.enum(['oz', 'ml', 'mg', 'g', 'kg', 'lb', 'cm', 'in', 'C', 'F', 'minutes', 'drops', 'dose']).optional(),
  milkType: z.enum(['breast milk', 'formula', 'cow milk', 'other']).optional(),
  side: z.enum(['left', 'right', 'both']).optional(),
  diaperType: z.enum(['wet', 'dirty', 'mixed', 'dry']).optional(),
  pottyResult: z.enum(['success', 'attempt']).optional(),
  medicineName: z.string().trim().max(200).optional(),
  food: z.string().trim().max(1000).optional(),
  measurement: z.enum(['weight', 'height', 'head']).optional(),
  sleepKind: z.enum(['nap', 'night']).optional(),
  sleepLocation: z.string().trim().max(100).optional(),
  leftMinutes: z.number().finite().min(0).max(1440).optional(),
  rightMinutes: z.number().finite().min(0).max(1440).optional(),
  foodTexture: z.enum(['puree', 'mashed', 'finger food', 'family food']).optional(),
  reaction: z.string().trim().max(500).optional(),
  stoolColor: z.string().trim().max(80).optional(),
  stoolConsistency: z.enum(['loose', 'soft', 'formed', 'hard']).optional(),
  medicineRoute: z.enum(['oral', 'topical', 'inhaled', 'other']).optional(),
  temperatureMethod: z.enum(['axillary', 'oral', 'rectal', 'ear', 'forehead', 'other']).optional(),
  symptomName: z.string().trim().max(200).optional(),
  severity: z.enum(['mild', 'moderate', 'severe']).optional(),
  customLabel: z.string().trim().max(100).optional()
}).strict();
export type EventDetails = z.infer<typeof detailsSchema>;
export const eventInputSchema = z.object({
  id: idSchema,
  childIds: z.array(idSchema).min(1).max(20).refine(ids => new Set(ids).size === ids.length, 'Duplicate children'),
  category: categorySchema,
  occurredAt: dateTimeSchema,
  endedAt: dateTimeSchema.nullable().default(null),
  notes: z.string().trim().max(5000).default(''),
  details: detailsSchema.default({})
}).strict().superRefine((event, ctx) => {
  const units: Partial<Record<Category, readonly string[]>> = {
    bottle: ['ml', 'oz'], water: ['ml', 'oz'], temperature: ['C', 'F'], medicine: ['mg', 'ml', 'drops', 'dose'],
    growth: event.details.measurement === 'weight' ? ['kg', 'lb'] : ['cm', 'in'],
  };
  const allowed = units[event.category];
  if (allowed && (event.details.quantity === undefined || !event.details.unit || !allowed.includes(event.details.unit))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['details'], message: 'A quantity and compatible unit are required' });
  }
  if (event.category === 'medicine' && !event.details.medicineName?.trim()) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['details', 'medicineName'], message: 'Medicine name is required' });
  if (event.category === 'growth' && !event.details.measurement) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['details', 'measurement'], message: 'Measurement type is required' });
  if (event.endedAt && Date.parse(event.endedAt) < Date.parse(event.occurredAt)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endedAt'], message: 'End must follow start' });
  }
  if (event.endedAt && !['sleep', 'nursing', 'pumping'].includes(event.category)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endedAt'], message: 'Only timed events have an end' });
  }
});
export type EventInput = z.infer<typeof eventInputSchema>;
export interface CareEvent extends EventInput {
  householdId: string;
  createdBy: string;
  createdByName: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  deletedAt: string | null;
}
export const childInputSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  middleName: z.string().trim().max(80).default(''),
  nickname: z.string().trim().max(80).default(''),
  dateOfBirth: z.string().date().refine(value => value <= new Date().toISOString().slice(0, 10), 'Birth date cannot be in the future'),
  dueDate: z.string().date().nullable().default(null),
  notes: z.string().trim().max(5000).default(''),
  active: z.boolean().default(true),
  timezone: timezoneSchema.nullable().default(null),
  enabledCategories: z.array(categorySchema).default([...categories])
}).strict();
export type ChildInput = z.infer<typeof childInputSchema>;
export interface Child extends ChildInput { id: string; householdId: string; createdAt: string; version?: number }
export interface User { id: string; email: string; name: string }
export interface Household { id: string; name: string; timezone: string; role: Role }
export interface Member { userId: string; name: string; email: string; role: Role }
export interface Invitation { id: string; email: string; role: Role; expiresAt: string }
export const reminderInputSchema = z.object({
  title: z.string().trim().min(1).max(160),
  childIds: z.array(idSchema).max(20).refine(ids => new Set(ids).size === ids.length, 'Duplicate children').default([]),
  category: categorySchema,
  dueAt: dateTimeSchema,
  repeatMinutes: z.number().int().min(5).max(525600).nullable().default(null)
}).strict();
export type ReminderInput = z.infer<typeof reminderInputSchema>;
export interface Reminder extends ReminderInput { id: string; householdId: string; completedAt: string | null; version?: number }
export interface Snapshot { household: Household; children: Child[]; events: CareEvent[]; members: Member[]; reminders: Reminder[]; serverTime: string; revision?: number }
export type HouseholdChange = { revision: number; entityId: string } & (
  { kind: 'events'; record: CareEvent | null } | { kind: 'children'; record: Child | null } |
  { kind: 'reminders'; record: Reminder | null } | { kind: 'members'; record: Member | null }
);
export interface ChangePage { changes: HouseholdChange[]; hasMore: boolean }
export const mutationSchema = z.object({
  mutationId: idSchema,
  operation: z.enum(['create', 'update', 'delete']),
  eventId: idSchema,
  baseVersion: z.number().int().min(0),
  event: eventInputSchema.optional()
}).strict().superRefine((mutation, ctx) => {
  if (mutation.operation !== 'delete' && (!mutation.event || mutation.event.id !== mutation.eventId)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['event'], message: 'Matching event is required' });
  }
});
export type SyncMutation = z.infer<typeof mutationSchema>;
export interface MutationResult { mutationId: string; status: 'applied' | 'conflict'; event: CareEvent }
export const registerSchema = z.object({ email: z.string().email().max(254), password: z.string().min(12).max(128), name: z.string().trim().min(1).max(80) }).strict();
export const loginSchema = registerSchema.pick({ email: true, password: true });
export const householdInputSchema = z.object({ name: z.string().trim().min(1).max(100), timezone: timezoneSchema }).strict();
export interface AuthResponse { token: string; user: User }
export interface Prediction {
  childId: string;
  type: 'nap' | 'feeding' | 'bedtime';
  predictedAt: string;
  windowStart: string;
  windowEnd: string;
  confidence: number;
  sampleCount: number;
  explanation: string;
  driftMinutes: number | null;
}
export interface SharedWindow { childIds: string[]; targetAt: string | null; windowStart: string | null; windowEnd: string | null; overlapStrength: number; explanation: string }
export function ageInMonths(dateOfBirth: string, now = new Date()): number {
  const birth = new Date(`${dateOfBirth}T00:00:00Z`);
  return Math.max(0, (now.getUTCFullYear() - birth.getUTCFullYear()) * 12 + now.getUTCMonth() - birth.getUTCMonth() - (now.getUTCDate() < birth.getUTCDate() ? 1 : 0));
}
export function trackingMode(dateOfBirth: string, now = new Date()): 'newborn' | 'baby' | 'toddler' | 'child' {
  const months = ageInMonths(dateOfBirth, now);
  return months < 3 ? 'newborn' : months < 12 ? 'baby' : months < 36 ? 'toddler' : 'child';
}
export function canWrite(role: Role): boolean { return role !== 'viewer'; }
export function canManage(role: Role): boolean { return role === 'owner' || role === 'admin'; }
