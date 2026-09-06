import { useNest } from '../src/lib/store';
import { Button, Card, Choice, Confirm, ErrorMessage, Heading, Label, Page, useTask } from '../src/components/ui';
import { useState } from 'react';
export default function Settings() {
  const nest = useNest(); const task = useTask(); const [resolve, setResolve] = useState<string | null>(null);
  return <Page title="Make yourself at home" subtitle="Appearance, synchronization, and your session.">
    <Card><Heading small>Appearance</Heading><Choice value={nest.theme} options={(['system', 'light', 'dark'] as const).map(value => ({ value, label: value }))} onChange={nest.setTheme} /></Card>
    <Card><Heading small>Synchronization</Heading><Label>{nest.online ? 'Server reachable' : 'Offline'} · {nest.queue.length} queued logs · {nest.conflicts.length} conflicts</Label><Label muted>This build checks for caregiver changes every 10 seconds while open. Logs are stored locally before upload. Native session tokens use secure storage; web sessions last for this browser tab. Local care data uses device storage.</Label><Button title="Sync now" disabled={nest.syncing} onPress={() => void nest.sync()} /></Card>
    {nest.conflicts.map(c => <Card key={c.mutation.mutationId}><Heading small>Another caregiver changed this log</Heading><Label>Server version {c.result.event.version}: {c.result.event.category} · {c.result.event.notes || 'No notes'}</Label><Label>Your attempted change: {JSON.stringify(c.mutation.event || { operation: c.mutation.operation })}</Label><Button title="Keep server version" onPress={() => setResolve(c.mutation.eventId)} /></Card>)}
    <Card><Heading small>{nest.user?.name}</Heading><Label>{nest.user?.email}</Label><Label muted>Signing out revokes this session and clears this account’s cached household data on this device. Pending logs must sync first.</Label><Button title="Sign out" variant="secondary" disabled={task.pending} onPress={() => void task.run(nest.logout)} /></Card><ErrorMessage message={task.error} />
    {resolve && <Confirm title="Keep server version?" description="This discards your conflicting edit and any later queued edits to this event on this device. Review the attempted change above before proceeding." confirmLabel="Keep server version" onClose={() => setResolve(null)} onConfirm={() => nest.resolveConflict(resolve)} />}
  </Page>;
}
