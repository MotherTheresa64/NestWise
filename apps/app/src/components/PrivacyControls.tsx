import { useState } from 'react';
import { useNest } from '../lib/store';
import { shareBackup } from '../lib/backup';
import { Button, Card, Dialog, ErrorMessage, Field, Heading, Label, useTask } from './ui';
export function PrivacyControls() {
  const nest=useNest();const task=useTask();const [deleting,setDeleting]=useState(false);const [confirmation,setConfirmation]=useState('');
  return <Card><Heading small>Your data, in your hands</Heading><Label muted>Export all currently accessible server data, including archived children, recorded events, reminders and caregiver details. Pending local changes are available separately in your local backup. Files contain private family information.</Label>
    <Button title="Export household data" variant="secondary" disabled={task.pending} onPress={()=>void task.run(async()=>shareBackup(await nest.request(`/households/${nest.householdId}/export`),'nestwise-household-data.json'))} />
    <Button title="Export all my data" variant="secondary" disabled={task.pending} onPress={()=>void task.run(async()=>shareBackup(await nest.request('/auth/export'),'nestwise-user-data.json'))} />
    {nest.snapshot?.household.role==='owner' && <Button title="Delete household permanently" variant="danger" onPress={()=>setDeleting(true)} />}
    <ErrorMessage message={task.error} />
    {deleting && <Dialog visible title="Permanently delete this household?" onClose={()=>setDeleting(false)}><Label>This removes all children, care logs, reminders, invitations and membership for everyone in this household from the active server database. It cannot be undone. Export any records you want to keep first. Copies already exported or cached on other devices and database backups cannot be remotely erased by this action.</Label><Field label="Type DELETE HOUSEHOLD" value={confirmation} onChangeText={setConfirmation} autoCapitalize="characters" /><ErrorMessage message={task.error} /><Button title="Delete household forever" variant="danger" disabled={task.pending || confirmation!=='DELETE HOUSEHOLD'} onPress={()=>void task.run(async()=>{await nest.deleteHousehold(confirmation);setDeleting(false);})} /></Dialog>}
  </Card>;
}
