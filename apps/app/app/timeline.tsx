import { useEffect, useState } from 'react';
import { categories, canWrite, type CareEvent, type EventInput } from '@nestwise/shared';
import { useNest } from '../src/lib/store';
import { Button, Card, Choice, Confirm, Empty, ErrorMessage, Field, Label, Page, Row, useTask } from '../src/components/ui';
import { EventEditor } from '../src/components/EventEditor';
import { categoryLabels, elapsed, formatDate, formatTime } from '../src/theme';
export const eventInput = (event: CareEvent): EventInput => ({ id: event.id, childIds: event.childIds, category: event.category, occurredAt: event.occurredAt, endedAt: event.endedAt, notes: event.notes, details: event.details });
export default function Timeline() {
  const nest = useNest(); const snapshot = nest.snapshot!; const task = useTask(); const [editor, setEditor] = useState(false); const [deleting, setDeleting] = useState<CareEvent | null>(null);
  const [child, setChild] = useState('all'); const [category, setCategory] = useState('all'); const [search, setSearch] = useState(''); const [, tick] = useState(0);
  useEffect(() => { const id = setInterval(() => tick(n => n + 1), 30000); return () => clearInterval(id); }, []);
  const events = snapshot.events.filter(e => !e.deletedAt && (child === 'all' || e.childIds.includes(child)) && (category === 'all' || e.category === category) && `${e.notes} ${JSON.stringify(e.details)}`.toLowerCase().includes(search.toLowerCase())).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  const writable = canWrite(snapshot.household.role);
  return <Page title="The little moments" subtitle="Your shared timeline. Timers continue from their recorded start, even when the app closes." action={writable ? <Button title="Log care" onPress={() => setEditor(true)} disabled={!snapshot.children.length} /> : undefined}>
    <Card><Choice label="Child" value={child} options={[{ value: 'all', label: 'All children' }, ...snapshot.children.map(c => ({ value: c.id, label: c.firstName }))]} onChange={setChild} /><Choice label="Category" value={category} options={[{ value: 'all', label: 'All care' }, ...categories.map(value => ({ value, label: categoryLabels[value] }))]} onChange={setCategory} /><Field label="Search notes and details" value={search} onChangeText={setSearch} /></Card>
    <ErrorMessage message={task.error} />
    {!events.length && <Empty title="Room for their day" description="No logs match these filters. New care moments will appear here." />}
    {events.map(event => <Card key={event.id}><Row style={{ justifyContent: 'space-between' }}><Label style={{ fontWeight: '600', fontSize: 18 }}>{categoryLabels[event.category]} · {snapshot.children.filter(c => event.childIds.includes(c.id)).map(c => c.firstName).join(' & ')}</Label><Label muted>{formatDate(event.occurredAt, snapshot.household.timezone)} · {formatTime(event.occurredAt, snapshot.household.timezone)}</Label></Row>
      <Label>{Object.entries(event.details).map(([key, value]) => `${key}: ${value}`).join(' · ') || 'Care moment'}</Label>{event.notes ? <Label>{event.notes}</Label> : null}
      <Row><Label muted>Recorded by {event.createdByName}{nest.queue.some(m => m.eventId === event.id) ? ' · pending sync' : ''}</Label>{['sleep', 'nursing', 'pumping'].includes(event.category) && <Label>{elapsed(event.occurredAt, event.endedAt || new Date())}{!event.endedAt ? ' · running' : ''}</Label>}</Row>
      {writable && <Row>{['sleep', 'nursing', 'pumping'].includes(event.category) && !event.endedAt && <Button title="Stop timer" disabled={task.pending} onPress={() => void task.run(() => nest.mutate({ ...eventInput(event), endedAt: new Date().toISOString() }, 'update', event.version))} />}<Button title="Delete log" variant="ghost" onPress={() => setDeleting(event)} /></Row>}
    </Card>)}{editor && <EventEditor onClose={() => setEditor(false)} />}{deleting && <Confirm title="Delete care log?" description="This removes the log from the household timeline. The server retains an audit record." onClose={() => setDeleting(null)} onConfirm={() => nest.mutate(eventInput(deleting), 'delete', deleting.version)} />}
  </Page>;
}
