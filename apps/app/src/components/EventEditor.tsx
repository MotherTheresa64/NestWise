import { DateField } from './DateField';
import { useState } from 'react';
import * as Crypto from 'expo-crypto';
import { categories, type CareEvent, type Category, type EventDetails, parseLog } from '@nestwise/shared';
import { useNest } from '../lib/store';
import { categoryLabels, localDateTime, parseDateTime } from '../theme';
import { Button, Choice, Dialog, ErrorMessage, Field, Label, Row, useTask } from './ui';

export function EventEditor({ onClose, existing }: { onClose: () => void; existing?: CareEvent }) {
  const nest = useNest(); const task = useTask();
  const [childIds, setChildIds] = useState<string[]>(existing?.childIds || nest.snapshot?.children.filter(c => c.active).slice(0, 1).map(c => c.id) || []);
  const [category, setCategory] = useState<Category>(existing?.category || 'bottle'); const [details, setDetails] = useState<EventDetails>(existing?.details || {});
  const [notes, setNotes] = useState(existing?.notes || ''); const [occurredAt, setOccurredAt] = useState(localDateTime(existing?.occurredAt));
  const [endedAt, setEndedAt] = useState(existing?.endedAt ? localDateTime(existing.endedAt) : ''); const [text, setText] = useState(''); const [draft, setDraft] = useState(false);
  const timed = ['sleep', 'nursing', 'pumping'].includes(category);
  const quantity = ['bottle', 'pumping', 'water', 'medicine', 'temperature', 'growth'].includes(category);
  return <Dialog visible title={existing ? 'Edit care moment' : 'Log a little moment'} onClose={onClose}>
    {existing && <Label>Editing version {existing.version}. If another caregiver changes this moment, your edit will be held for review in Settings.</Label>}
    <Field label="Quick phrase" hint='Try “River and Sage: bottle 120 ml 20 minutes ago” or “nursed left for 15 minutes”. Review every field before saving.' value={text} onChangeText={setText} />
    <Button title="Review phrase" variant="secondary" onPress={() => { const result = parseLog(text, { now: new Date(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, children: nest.snapshot?.children.filter(c => c.active) || [] }); if (!result) { task.setError('I could not confidently read that phrase. Try “River: nursed left for 15 minutes” or fill in the form below. Use AM/PM for clock times, or an explicit timezone for full timestamps.'); return; } setCategory(result.category); setDetails(result.details); setNotes(result.notes); if (result.childIds) setChildIds(result.childIds); if (result.occurredAt) setOccurredAt(localDateTime(result.occurredAt)); setEndedAt(result.endedAt ? localDateTime(result.endedAt) : ""); setDraft(true); task.setError(null); }} />
    {draft && <Label>Draft ready to review. Nothing has been saved.</Label>}
    <Choice label="Children" multiple value={childIds} options={(nest.snapshot?.children || []).filter(c => c.active || existing?.childIds.includes(c.id)).map(c => ({ value: c.id, label: `${c.firstName}${c.active ? '' : ' (archived)'}` }))} onChange={id => setChildIds(ids => ids.includes(id) ? ids.filter(i => i !== id) : [...ids, id])} />
    <Choice label="Care event" value={category} options={categories.map(value => ({ value, label: categoryLabels[value] }))} onChange={value => { setCategory(value); setDetails({}); }} />
    <DateField time label="Start / event time" value={occurredAt} onChangeText={setOccurredAt} hint="YYYY-MM-DD HH:mm in this device’s timezone." />
    {timed && <DateField time label="End time (optional)" value={endedAt} onChangeText={setEndedAt} hint="Leave blank to start a timer. Stop it from the timeline." />}
    {category === 'sleep' && <Choice label="Sleep type" options={[{ value: 'nap', label: 'Nap' }, { value: 'night', label: 'Night' }]} value={details.sleepKind || 'nap'} onChange={sleepKind => setDetails({ ...details, sleepKind })} />}
    {category === 'nursing' && <Choice label="Side" options={(['left', 'right', 'both'] as const).map(value => ({ value, label: value }))} value={details.side || 'both'} onChange={side => setDetails({ ...details, side })} />}
    {category === 'diaper' && <Choice label="Diaper" options={(['wet', 'dirty', 'mixed', 'dry'] as const).map(value => ({ value, label: value }))} value={details.diaperType || 'wet'} onChange={diaperType => setDetails({ ...details, diaperType })} />}
    {quantity && <Row><Field label="Quantity" keyboardType="decimal-pad" value={details.quantity === undefined ? '' : String(details.quantity)} onChangeText={v => setDetails({ ...details, quantity: v === '' ? undefined : Number(v) })} /><Choice label="Unit" options={(category === 'temperature' ? ['C', 'F'] as const : category === 'growth' ? ['kg', 'lb', 'cm', 'in'] as const : category === 'medicine' ? ['mg', 'ml', 'drops', 'dose'] as const : ['ml', 'oz'] as const).map(value => ({ value, label: value }))} value={details.unit || ''} onChange={unit => setDetails({ ...details, unit: unit as EventDetails['unit'] })} /></Row>}
    {category === 'medicine' && <Field label="Medicine name" value={details.medicineName || ''} onChangeText={medicineName => setDetails({ ...details, medicineName })} />}
    {category === 'growth' && <Choice label="Measurement" options={(['weight', 'height', 'head'] as const).map(value => ({ value, label: value }))} value={details.measurement || 'weight'} onChange={measurement => setDetails({ ...details, measurement })} />}
    {category === 'food' && <Field label="Food" value={details.food || ''} onChangeText={food => setDetails({ ...details, food })} />}
    {category === 'sleep' && <Field label="Sleep location" value={details.sleepLocation || ''} onChangeText={sleepLocation => setDetails({ ...details, sleepLocation })} />}
    {category === 'nursing' && <Row>{(['leftMinutes', 'rightMinutes'] as const).map(key => <Field key={key} label={key === 'leftMinutes' ? 'Left side minutes' : 'Right side minutes'} keyboardType="decimal-pad" value={details[key] === undefined ? '' : String(details[key])} onChangeText={v => setDetails({ ...details, [key]: v === '' ? undefined : Number(v) })} />)}</Row>}
    {(category === 'bottle' || category === 'pumping') && <Choice label="Milk type" value={details.milkType || []} options={(['breast milk', 'formula', 'cow milk', 'other'] as const).map(value => ({ value, label: value }))} onChange={milkType => setDetails({ ...details, milkType })} />}
    {category === 'food' && <><Choice label="Texture" value={details.foodTexture || []} options={(['puree', 'mashed', 'finger food', 'family food'] as const).map(value => ({ value, label: value }))} onChange={foodTexture => setDetails({ ...details, foodTexture })} /><Field label="Observed reaction" value={details.reaction || ''} onChangeText={reaction => setDetails({ ...details, reaction })} /></>}
    {category === 'diaper' && <><Field label="Stool color" value={details.stoolColor || ''} onChangeText={stoolColor => setDetails({ ...details, stoolColor })} /><Choice label="Consistency" value={details.stoolConsistency || []} options={(['loose', 'soft', 'formed', 'hard'] as const).map(value => ({ value, label: value }))} onChange={stoolConsistency => setDetails({ ...details, stoolConsistency })} /></>}
    {category === 'medicine' && <Choice label="Administration route" value={details.medicineRoute || []} options={(['oral', 'topical', 'inhaled', 'other'] as const).map(value => ({ value, label: value }))} onChange={medicineRoute => setDetails({ ...details, medicineRoute })} />}
    {category === 'temperature' && <Choice label="Measurement method" value={details.temperatureMethod || []} options={(['axillary', 'oral', 'rectal', 'ear', 'forehead', 'other'] as const).map(value => ({ value, label: value }))} onChange={temperatureMethod => setDetails({ ...details, temperatureMethod })} />}
    {category === 'symptom' && <><Field label="Symptom" value={details.symptomName || ''} onChangeText={symptomName => setDetails({ ...details, symptomName })} /><Choice label="Caregiver-observed severity" value={details.severity || []} options={(['mild', 'moderate', 'severe'] as const).map(value => ({ value, label: value }))} onChange={severity => setDetails({ ...details, severity })} /></>}
    {category === 'custom' && <Field label="Event name" value={details.customLabel || ''} onChangeText={customLabel => setDetails({ ...details, customLabel })} />}
    {existing?.endedAt && timed && !endedAt && <Label>Clearing the end time reopens this timer from its recorded start.</Label>}
    <Field label="Notes" value={notes} onChangeText={setNotes} multiline />
    <ErrorMessage message={task.error} />
    <Button title={task.pending ? 'Saving…' : existing ? 'Confirm changes' : timed && !endedAt ? 'Save and start timer' : 'Confirm and save'} disabled={task.pending || !childIds.length} onPress={() => void task.run(async () => {
      if (quantity && (details.quantity === undefined || !Number.isFinite(details.quantity) || !details.unit)) throw new Error('Enter a quantity and choose its unit.');
      if (category === 'medicine' && !details.medicineName?.trim()) throw new Error('Enter the medicine name.');
      await nest.mutate({ id: existing?.id || Crypto.randomUUID(), childIds, category, occurredAt: existing && occurredAt === localDateTime(existing.occurredAt) ? existing.occurredAt : parseDateTime(occurredAt), endedAt: timed && endedAt ? existing?.endedAt && endedAt === localDateTime(existing.endedAt) ? existing.endedAt : parseDateTime(endedAt) : null, notes,
        details: { ...details, ...(category === 'sleep' ? { sleepKind: details.sleepKind || 'nap' } : {}), ...(category === 'diaper' ? { diaperType: details.diaperType || 'wet' } : {}), ...(category === 'nursing' ? { side: details.side || 'both' } : {}), ...(category === 'growth' ? { measurement: details.measurement || 'weight' } : {}) } }, existing ? 'update' : 'create', existing?.version || 0); onClose();
    })} />
  </Dialog>;
}
