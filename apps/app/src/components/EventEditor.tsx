import { DateField } from './DateField';
import { useState } from 'react';
import * as Crypto from 'expo-crypto';
import { categories, type CareEvent, type Category, type EventDetails, parseLog, repeatDetails, mealFoods } from '@nestwise/shared';
import { FoodLibrary } from './FoodLibrary';
import { CareDetailsFields } from './CareDetailsFields';
import { useNest } from '../lib/store';
import { categoryLabels, localDateTime, parseDateTime } from '../theme';
import { Button, Choice, Dialog, ErrorMessage, Field, Label, Row, Segmented, useTask } from './ui';

export function EventEditor({ onClose, existing, repeat, initialCategory = 'bottle', initialChildIds }: { onClose: () => void; existing?: CareEvent; repeat?: CareEvent; initialCategory?: Category; initialChildIds?: string[] }) {
  const nest = useNest(); const task = useTask(); const [library,setLibrary]=useState(false); const [duration,setDuration]=useState('');
  const [completedOpen,setCompletedOpen]=useState(!!existing?.endedAt);
  const [notesOpen,setNotesOpen]=useState(!!existing?.notes);
  const [changeType,setChangeType]=useState(!initialChildIds);const [changeTime,setChangeTime]=useState(!initialChildIds);const [phraseOpen,setPhraseOpen]=useState(!initialChildIds);
  function recentDefaults(value: Category): EventDetails { const recent = nest.snapshot?.events.filter(e => !e.deletedAt && e.category === value && e.childIds.some(id => (initialChildIds || childIds).includes(id))).sort((a,b)=>b.occurredAt.localeCompare(a.occurredAt))[0]; return recent ? repeatDetails(recent) : {}; }
  const [childIds, setChildIds] = useState<string[]>(existing?.childIds || initialChildIds || repeat?.childIds || nest.snapshot?.children.filter(c => c.active).slice(0, 1).map(c => c.id) || []);
  const [category, setCategory] = useState<Category>(existing?.category || repeat?.category || initialCategory); const [details, setDetails] = useState<EventDetails>(existing?.details || (repeat ? repeatDetails(repeat) : recentDefaults(initialCategory)));
  const [notes, setNotes] = useState(existing?.notes || ''); const [occurredAt, setOccurredAt] = useState(localDateTime(existing?.occurredAt));
  const [endedAt, setEndedAt] = useState(existing?.endedAt ? localDateTime(existing.endedAt) : ''); const [text, setText] = useState(''); const [draft, setDraft] = useState(false);
  const timed = ['sleep', 'nursing', 'pumping'].includes(category);
  const quantity = ['bottle', 'pumping', 'water', 'medicine', 'temperature', 'growth'].includes(category);
  const saveAction = <Button title={task.pending ? 'Saving…' : existing ? 'Confirm changes' : timed && !endedAt ? 'Save and start timer' : 'Confirm and save'} disabled={task.pending || !childIds.length} onPress={() => void task.run(async () => {
      if (quantity && (category !== 'pumping' || details.quantity !== undefined) && (details.quantity === undefined || !Number.isFinite(details.quantity) || !details.unit)) throw new Error('Enter a quantity and choose its unit.');
      if (category === 'medicine' && !details.medicineName?.trim()) throw new Error('Enter the medicine name.');
      await nest.mutate({ id: existing?.id || Crypto.randomUUID(), childIds, category, occurredAt: existing && occurredAt === localDateTime(existing.occurredAt) ? existing.occurredAt : parseDateTime(occurredAt), endedAt: timed && endedAt ? existing?.endedAt && endedAt === localDateTime(existing.endedAt) ? existing.endedAt : parseDateTime(endedAt) : null, notes,
        details: { ...details, ...(category === 'food' && details.foods?.length && details.food?.trim() ? { foods: [...details.foods,{name:details.food.trim()}],food:undefined } : {}), ...(category === 'symptom' && details.symptoms?.length && details.symptomName?.trim() ? { symptoms: [...details.symptoms,{name:details.symptomName.trim(),severity:details.severity}],symptomName:undefined } : {}), ...(details.routineSteps ? { routineSteps: details.routineSteps.map(s=>s.trim()).filter(Boolean) } : {}), ...(category === 'sleep' ? { sleepKind: details.sleepKind || 'nap' } : {}), ...(category === 'diaper' ? { diaperType: details.diaperType || 'wet' } : {}), ...(category === 'nursing' ? { side: details.side || 'both' } : {}), ...(category === 'growth' ? { measurement: details.measurement || 'weight' } : {}) } }, existing ? 'update' : 'create', existing?.version || 0); onClose();
    })} />;
  return <Dialog visible footer={<><ErrorMessage message={task.error} />{saveAction}</>} title={existing ? 'Edit care moment' : 'Log a little moment'} onClose={onClose}>
    {repeat && <Label>Repeat draft: check children, amounts and time. Observations and notes have not been copied.</Label>}
    {existing && <Label>Editing version {existing.version}. If another caregiver changes this moment, your edit will be held for review in Settings.</Label>}
    <Choice label="Children" multiple value={childIds} options={(nest.snapshot?.children || []).filter(c => c.active || existing?.childIds.includes(c.id)).map(c => ({ value: c.id, label: `${c.firstName}${c.active ? '' : ' (archived)'}` }))} onChange={id => setChildIds(ids => ids.includes(id) ? ids.filter(i => i !== id) : [...ids, id])} />
    {!phraseOpen && <Button title="Use a quick phrase" variant="ghost" onPress={()=>setPhraseOpen(true)} />}
    {phraseOpen && <><Field label="Quick phrase" hint='Try “River and Sage: bottle 120 ml 20 minutes ago” or “nursed left for 15 minutes”. Review every field before saving.' value={text} onChangeText={setText} />
    <Button title="Review phrase" variant="secondary" onPress={() => { const result = parseLog(text, { now: new Date(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, children: nest.snapshot?.children.filter(c => c.active) || [] }); if (!result) { task.setError('I could not confidently read that phrase. Try “River: nursed left for 15 minutes” or fill in the form below. Use AM/PM for clock times, or an explicit timezone for full timestamps.'); return; } setCategory(result.category); setDetails(result.details); setNotes(result.notes); if (result.childIds) setChildIds(result.childIds); if (result.occurredAt) setOccurredAt(localDateTime(result.occurredAt)); setEndedAt(result.endedAt ? localDateTime(result.endedAt) : ""); setDraft(true); task.setError(null); }} />
    </>}
    {draft && <Label>Draft ready to review. Nothing has been saved.</Label>}

    {!changeType && <Row><Label style={{fontWeight:"600"}}>{categoryLabels[category]}</Label><Button title="Change care type" variant="ghost" onPress={()=>setChangeType(true)} /></Row>}
    {changeType && <Choice label="Care event" value={category} options={categories.map(value => ({ value, label: categoryLabels[value] }))} onChange={value => { setCategory(value); setDetails(existing ? {} : recentDefaults(value)); setEndedAt(''); }} />}
    {!changeType&&['diaper','potty','bottle','nursing'].includes(category)&&<Segmented label="Care type" value={category} options={(category==='diaper'||category==='potty'?['diaper','potty']:['bottle','nursing']).map(value=>({value,label:categoryLabels[value]}))} onChange={value=>{setCategory(value as Category);setDetails(recentDefaults(value as Category));setEndedAt('');}}/>}
    {!changeTime && <Button title={"Time: "+occurredAt+" · Change"} variant="secondary" onPress={()=>setChangeTime(true)} />}
    {changeTime && <><DateField time label="Start / event time" value={occurredAt} onChangeText={setOccurredAt} hint="YYYY-MM-DD HH:mm in this device’s timezone." />
    <Row>{[0,15,30,60].map(minutes=><Button key={minutes} title={minutes ? minutes+' minutes ago' : 'Now'} variant="secondary" onPress={()=>setOccurredAt(localDateTime(new Date(Date.now()-minutes*60000)))} />)}</Row>
    </>}
    {timed && <Button title={completedOpen?'Hide completed-session fields':'Enter a completed session'} variant="secondary" onPress={()=>setCompletedOpen(!completedOpen)}/>}
    {timed && completedOpen && <DateField time label="End time (optional)" value={endedAt} onChangeText={setEndedAt} hint="Leave blank to start a timer. Stop it from the timeline." />}
    {timed && completedOpen && <Row><Field label="Recorded duration minutes" keyboardType="number-pad" value={duration} onChangeText={setDuration} /><Button title="Set end from duration" variant="secondary" onPress={()=>{const minutes=Number(duration);if(!Number.isInteger(minutes)||minutes<1||minutes>1440){task.setError('Enter a whole duration from 1 to 1440 minutes.');return;}try{setEndedAt(localDateTime(new Date(Date.parse(parseDateTime(occurredAt))+minutes*60000)));task.setError(null);}catch{task.setError('Choose a valid start time first.');}}} /></Row>}
    {timed&&!endedAt&&<Label>Timer will start at the recorded time. You can stop it from the timeline.</Label>}
    {quantity && <Row><Field label="Quantity" style={{fontSize:28,fontWeight:'600',minHeight:66}} keyboardType="decimal-pad" value={details.quantity === undefined ? '' : String(details.quantity)} onChangeText={v => setDetails({ ...details, quantity: v === '' ? undefined : Number(v) })} /><Choice label="Unit" options={(category === 'temperature' ? ['C', 'F'] as const : category === 'growth' ? details.measurement === 'height' || details.measurement === 'head' ? ['cm','in'] as const : ['kg','lb'] as const : category === 'medicine' ? ['mg', 'ml', 'drops', 'dose'] as const : ['ml', 'oz'] as const).map(value => ({ value, label: value }))} value={details.unit || ''} onChange={unit => setDetails({ ...details, unit: unit as EventDetails['unit'] })} /></Row>}
    {['bottle','water'].includes(category) && <Choice label="Quick amount" value={[]} options={(details.unit === 'ml' ? [60,120,180,240] : [2,4,6,8]).map(value=>({value:String(value),label:String(value)+' '+(details.unit==='ml'?'ml':'oz')}))} onChange={value=>setDetails({...details,quantity:Number(value),unit:details.unit==='ml'?'ml':'oz'})} />}
    {category==='food' && <Button title="Open food library" variant="secondary" onPress={()=>setLibrary(true)} />}
    {library && <FoodLibrary childIds={childIds} onClose={()=>setLibrary(false)} onPick={food=>setDetails({...details,foods:[...(details.foods || []),{foodId:food.id,name:food.name}]})} />}
    <CareDetailsFields key={category} category={category} details={details} onChange={setDetails} recentFoods={[...new Set((nest.snapshot?.events || []).filter(e=>!e.deletedAt && e.category==='food' && e.childIds.some(id=>childIds.includes(id))).sort((a,b)=>b.occurredAt.localeCompare(a.occurredAt)).flatMap(e=>mealFoods(e.details).map(f=>f.name)))]} />
    {existing?.endedAt && timed && !endedAt && <Label>Clearing the end time reopens this timer from its recorded start.</Label>}
    <Button title={notesOpen?"Hide note":"Add a note"} variant="ghost" onPress={()=>setNotesOpen(!notesOpen)}/>{notesOpen&&<Field label="Notes" value={notes} onChangeText={setNotes} multiline />}
    <ErrorMessage message={task.error} />

  </Dialog>;
}
