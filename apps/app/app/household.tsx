import { useState } from 'react';
import { canManage } from '@nestwise/shared';
import { useNest } from '../src/lib/store';
import { HouseholdJoinCreate } from '../src/screens/OnboardingScreen';
import { HouseholdSafety } from '../src/components/HouseholdSafety';
import { Button, Card, Choice, ErrorMessage, Field, Heading, Label, Page, useTask } from '../src/components/ui';
export default function Household() {
  const nest = useNest(); const snapshot = nest.snapshot!; const task = useTask(); const [email, setEmail] = useState(''); const [role, setRole] = useState('caregiver'); const [token, setToken] = useState('');
  return <Page title="It takes a nest" subtitle="Share care with people you trust. Viewers can read; caregivers can log; administrators can manage children and invite caregivers.">
    <Card><Heading small>{snapshot.household.name}</Heading>{snapshot.members.map(m => <Label key={m.userId}>{m.name} · {m.email} · {m.role}</Label>)}</Card>
    {canManage(snapshot.household.role) && <Card><Heading small>Invite a caregiver</Heading><Field label="Caregiver email" value={email} onChangeText={setEmail} autoCapitalize="none" /><Choice label="Permission" value={role} options={(snapshot.household.role === 'owner' ? ['caregiver', 'viewer', 'admin'] : ['caregiver', 'viewer']).map(value => ({ value, label: value }))} onChange={setRole} /><Button title="Create invitation" disabled={task.pending} onPress={() => void task.run(async () => { const result = await nest.request<{ token: string }>(`/households/${nest.householdId}/invitations`, { method: 'POST', body: { email, role } }); setToken(result.token); })} /><ErrorMessage message={task.error} />{token && <Field label="Invitation token — share privately" value={token} editable={false} hint="Expires in seven days. Only an account with the invited email can accept it. No email was sent." />}</Card>}
    <HouseholdSafety /><HouseholdJoinCreate />
  </Page>;
}
