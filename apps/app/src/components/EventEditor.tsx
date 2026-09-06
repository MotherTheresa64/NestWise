import { useState } from 'react';
import * as Crypto from 'expo-crypto';
import { categories, type Category, type EventDetails, parseLog } from '@nestwise/shared';
import { useNest } from '../lib/store';
import { categoryLabels, localDateTime, parseDateTime } from '../theme';
import { Button, Choice, Dialog, ErrorMessage, Field, Label, Row, useTask } from './ui';

export function EventEditor({ onClose }: { onClose: () => void }) {
  const nest = useNest(); const task = useTask();
  const [childIds, setChildIds] = useState<string[]>(nest.snapshot?.children.slice(0, 1).map(c => c.id) || []);
  const [category, setCategory] = useState<Category>('bottle'); const [details, setDetails] = useState<EventDetails>({});
  const [notes, setNotes] = useState(''); const [occurredAt, setOccurredAt] = useState(localDateTime());
  const [endedAt, setEndedAt] = useState(''); const [text, setText] = useState(''); const [draft, setDraft] = useState(false);
  const timed = ['sleep', 'nursing', 'pumping'].includes(category);
  const quantity = ['bottle', 'pumping', 'water', 'medicine', 'temperature', 'growth'].includes(category);
  return <Dialog visible title="Log a little moment" onClose={onClose}>
    <Field label="Quick phrase" hint='Try “bottle 120 ml” or “wet diaper”. Choose children and time below, then confirm with Save.' value={text} onChangeText={setText} />
    <Button title="Review phrase" variant="secondary" onPress={() => { const result = parseLog(text); if (!result) { task.setError('Use “bottle 120 ml” or “wet diaper”, or fill in the form below. Other phrases are not supported yet.'); return; } setCategory(result.category); setDetails(result.details); setDraft(true); task.setError(null); }} />
    {draft && <Label>Draft ready to review. Nothing has been saved.</Label>}
    <Choice label="Children" multiple value={childIds} options={(nest.snapshot?.children || []).filter(c => c.active).map(c => ({ value: c.id, label: c.firstName }))} onChange={id => setChildIds(ids => ids.includes(id) ? ids.filter(i => i !== id) : [...ids, id])} />
    <Choice label="Care event" value={category} options={categories.map(value => ({ value, label: categoryLabels[value] }))} onChange={value => { setCategory(value); setDetails({}); }} />
    <Field label="Start / event time" value={occurredAt} onChangeText={setOccurredAt} hint="YYYY-MM-DD HH:mm in this device’s timezone." />
    {timed && <Field label="End time (optional)" value={endedAt} onChangeText={setEndedAt} hint="Leave blank to start a timer. Stop it from the timeline." />}
    {category === 'sleep' && <Choice label="Sleep type" options={[{ value: 'nap', label: 'Nap' }, { value: 'night', label: 'Night' }]} value={details.sleepKind || 'nap'} onChange={sleepKind => setDetails({ ...details, sleepKind })} />}
    {category === 'nursing' && <Choice label="Side" options={(['left', 'right', 'both'] as const).map(value => ({ value, label: value }))} value={details.side || 'both'} onChange={side => setDetails({ ...details, side })} />}
    {category === 'diaper' && <Choice label="Diaper" options={(['wet', 'dirty', 'mixed', 'dry'] as const).map(value => ({ value, label: value }))} value={details.diaperType || 'wet'} onChange={diaperType => setDetails({ ...details, diaperType })} />}
    {quantity && <Row><Field label="Quantity" keyboardType="decimal-pad" value={details.quantity === undefined ? '' : String(details.quantity)} onChangeText={v => setDetails({ ...details, quantity: v === '' ? undefined : Number(v) })} /><Choice label="Unit" options={(category === 'temperature' ? ['C', 'F'] as const : category === 'growth' ? ['kg', 'lb', 'cm', 'in'] as const : category === 'medicine' ? ['mg', 'ml', 'drops', 'dose'] as const : ['ml', 'oz'] as const).map(value => ({ value, label: value }))} value={details.unit || ''} onChange={unit => setDetails({ ...details, unit: unit as EventDetails['unit'] })} /></Row>}
    {category === 'medicine' && <Field label="Medicine name" value={details.medicineName || ''} onChangeText={medicineName => setDetails({ ...details, medicineName })} />}
    {category === 'growth' && <Choice label="Measurement" options={(['weight', 'height', 'head'] as const).map(value => ({ value, label: value }))} value={details.measurement || 'weight'} onChange={measurement => setDetails({ ...details, measurement })} />}
    {category === 'food' && <Field label="Food" value={details.food || ''} onChangeText={food => setDetails({ ...details, food })} />}
    <Field label="Notes" value={notes} onChangeText={setNotes} multiline />
    <ErrorMessage message={task.error} />
    <Button title={task.pending ? 'Saving…' : timed && !endedAt ? 'Save and start timer' : 'Confirm and save'} disabled={task.pending || !childIds.length} onPress={() => void task.run(async () => {
      if (quantity && (details.quantity === undefined || !Number.isFinite(details.quantity) || !details.unit)) throw new Error('Enter a quantity and choose its unit.');
      if (category === 'medicine' && !details.medicineName?.trim()) throw new Error('Enter the medicine name.');
      await nest.mutate({ id: Crypto.randomUUID(), childIds, category, occurredAt: parseDateTime(occurredAt), endedAt: timed && endedAt ? parseDateTime(endedAt) : null, notes,
        details: { ...details, ...(category === 'sleep' ? { sleepKind: details.sleepKind || 'nap' } : {}), ...(category === 'diaper' ? { diaperType: details.diaperType || 'wet' } : {}), ...(category === 'nursing' ? { side: details.side || 'both' } : {}), ...(category === 'growth' ? { measurement: details.measurement || 'weight' } : {}) } }); onClose();
    })} />
  </Dialog>;
}
