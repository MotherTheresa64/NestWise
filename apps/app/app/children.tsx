import { useState } from 'react';
import { canManage, childInputSchema } from '@nestwise/shared';
import { useNest } from '../src/lib/store';
import { Button, Card, ErrorMessage, Field, Heading, Label, Page, useTask } from '../src/components/ui';
export default function Children() {
  const nest = useNest(); const snapshot = nest.snapshot!; const task = useTask(); const [name, setName] = useState(''); const [dob, setDob] = useState('');
  return <Page title="Your little people" subtitle="Each child has their own history. Log a shared moment for siblings or twins in one step.">
    {snapshot.children.map(c => <Card key={c.id}><Heading small>{c.firstName}</Heading><Label>Born {c.dateOfBirth}</Label>{c.notes && <Label>{c.notes}</Label>}</Card>)}
    {canManage(snapshot.household.role) && <Card><Heading small>Add a child</Heading><Field label="First name" value={name} onChangeText={setName} /><Field label="Date of birth" hint="YYYY-MM-DD" value={dob} onChangeText={setDob} /><ErrorMessage message={task.error} /><Button title="Add child" disabled={task.pending} onPress={() => void task.run(async () => { await nest.request(`/households/${nest.householdId}/children`, { method: 'POST', body: childInputSchema.parse({ firstName: name, dateOfBirth: dob }) }); await nest.refresh(); setName(''); setDob(''); })} /></Card>}
  </Page>;
}
