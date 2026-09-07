import { useState } from 'react';
import { canManage, childInputSchema, type Child } from '@nestwise/shared';
import { useNest } from '../src/lib/store';
import { Button, Card, Confirm, Dialog, ErrorMessage, Field, Heading, Label, Page, Row, useTask } from '../src/components/ui';
const childInput = (child: Child) => childInputSchema.parse(Object.fromEntries(Object.entries(child).filter(([key]) => !['id', 'householdId', 'createdAt', 'version'].includes(key))));
function ChildEditor({ child, onClose }: { child: Child; onClose: () => void }) {
  const nest = useNest(); const task = useTask(); const [name, setName] = useState(child.firstName); const [dob, setDob] = useState(child.dateOfBirth);
  const [nickname, setNickname] = useState(child.nickname); const [notes, setNotes] = useState(child.notes);
  return <Dialog visible title="Edit child" onClose={onClose}><Field label="First name" editable={!task.pending} value={name} onChangeText={setName} /><Field label="Nickname" value={nickname} onChangeText={setNickname} /><Field label="Date of birth" value={dob} onChangeText={setDob} /><Field label="Care notes" value={notes} onChangeText={setNotes} multiline /><ErrorMessage message={task.error} /><Button title="Save child changes" disabled={task.pending} onPress={() => void task.run(async () => { await nest.request(`/households/${nest.householdId}/children/${child.id}`, { method: 'PATCH', body: { baseVersion: child.version || 1, child: { ...childInput(child), firstName: name, dateOfBirth: dob, nickname, notes } } }); await nest.sync(); onClose(); })} /></Dialog>;
}
export default function Children() {
  const nest = useNest(); const snapshot = nest.snapshot!; const task = useTask(); const [name, setName] = useState(''); const [dob, setDob] = useState('');
  const [editing, setEditing] = useState<Child | null>(null); const [archiving, setArchiving] = useState<Child | null>(null);
  return <Page title="Your little people" subtitle="Each child has their own history. Log a shared moment for siblings or twins in one step.">
    {snapshot.children.map(c => <Card key={c.id}><Heading small>{c.firstName}{c.active ? '' : ' · Archived'}</Heading><Label>Born {c.dateOfBirth}{c.nickname ? ` · ${c.nickname}` : ''}</Label>{c.notes && <Label>{c.notes}</Label>}{canManage(snapshot.household.role) && <Row><Button title={`Edit ${c.firstName}`} variant="secondary" onPress={() => setEditing(c)} /><Button title={`${c.active ? 'Archive' : 'Restore'} ${c.firstName}`} variant="ghost" onPress={() => setArchiving(c)} /></Row>}</Card>)}
    {canManage(snapshot.household.role) && <Card><Heading small>Add a child</Heading><Field label="First name" editable={!task.pending} value={name} onChangeText={setName} /><Field label="Date of birth" editable={!task.pending} hint="YYYY-MM-DD" value={dob} onChangeText={setDob} /><ErrorMessage message={task.error} /><Button title="Add child" disabled={task.pending} onPress={() => void task.run(async () => { await nest.request(`/households/${nest.householdId}/children`, { method: 'POST', body: childInputSchema.parse({ firstName: name, dateOfBirth: dob }) }); await nest.refresh(); setName(''); setDob(''); })} /></Card>}
    {editing && <ChildEditor child={editing} onClose={() => setEditing(null)} />}
    {archiving && <Confirm title={`${archiving.active ? 'Archive' : 'Restore'} ${archiving.firstName}?`} description="Archiving hides a child from new logging choices. Their recorded history and shared sibling logs remain available in timelines and reports." confirmLabel={archiving.active ? 'Archive child' : 'Restore child'} onClose={() => setArchiving(null)} onConfirm={async () => { await nest.request(`/households/${nest.householdId}/children/${archiving.id}`, { method: 'PATCH', body: { baseVersion: archiving.version || 1, child: { ...childInput(archiving), active: !archiving.active } } }); await nest.sync(); }} />}
  </Page>;
}
