import { useState } from 'react';
import { canWrite } from '@nestwise/shared';
import { useNest } from '../src/lib/store';
import { localDateTime, parseDateTime } from '../src/theme';
import { Button, Card, ErrorMessage, Field, Heading, Label, Page, useTask } from '../src/components/ui';
export default function Reminders() {
  const nest = useNest(); const snapshot = nest.snapshot!; const task = useTask(); const [title, setTitle] = useState(''); const [due, setDue] = useState(localDateTime()); const writable = canWrite(snapshot.household.role);
  return <Page title="A gentle nudge" subtitle="Shared in-app reminders. Background push notifications are not enabled in this build.">
    {snapshot.reminders.filter(r => !r.completedAt).sort((a, b) => a.dueAt.localeCompare(b.dueAt)).map(r => <Card key={r.id}><Heading small>{r.title}</Heading><Label>{new Date(r.dueAt).toLocaleString()}{Date.parse(r.dueAt) < Date.now() ? ' · Due now' : ''}</Label>{writable && <Button title="Mark complete" disabled={task.pending} onPress={() => void task.run(async () => { await nest.request(`/households/${nest.householdId}/reminders/${r.id}/complete`, { method: 'POST' }); await nest.refresh(); })} />}</Card>)}
    {writable && <Card><Heading small>New reminder</Heading><Field label="Reminder" value={title} onChangeText={setTitle} /><Field label="Due at" value={due} onChangeText={setDue} hint="YYYY-MM-DD HH:mm in this device’s timezone." /><Button title="Add reminder" disabled={task.pending} onPress={() => void task.run(async () => { await nest.request(`/households/${nest.householdId}/reminders`, { method: 'POST', body: { title, dueAt: parseDateTime(due), category: 'routine' } }); await nest.refresh(); setTitle(''); })} /></Card>}<ErrorMessage message={task.error} />
  </Page>;
}
