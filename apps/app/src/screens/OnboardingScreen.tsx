import { useState } from 'react';
import { householdInputSchema } from '@nestwise/shared';
import { useNest } from '../lib/store';
import { Button, Card, ErrorMessage, Field, Heading, Label, Page, useTask } from '../components/ui';

export function HouseholdJoinCreate({ onDone }: { onDone?: () => void }) {
  const nest = useNest(); const task = useTask(); const [name, setName] = useState('');
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  const [token, setToken] = useState('');
  return <><Card><Heading small>Create your household</Heading><Label muted>Give your shared space a name. You can add children and invite caregivers next.</Label><Field label="Household name" placeholder="e.g. The Williams family" value={name} onChangeText={setName} /><Field label="Household timezone" hint="IANA timezone, e.g. America/New_York or Europe/London." value={timezone} onChangeText={setTimezone} autoCapitalize="none" /><Button title="Create household" disabled={task.pending} onPress={() => void task.run(async () => { const input = householdInputSchema.parse({ name, timezone }); await nest.createHousehold(input.name, input.timezone); onDone?.(); })} /></Card>
    <Card><Heading small>Have an invitation?</Heading><Field label="Invitation token" value={token} onChangeText={setToken} autoCapitalize="none" placeholder="Paste the token your household shared" /><Button title="Join household" variant="secondary" disabled={task.pending || !token.trim()} onPress={() => void task.run(async () => { await nest.request('/invitations/accept', { method: 'POST', body: { token: token.trim() } }); await nest.refresh(); setToken(''); onDone?.(); })} /></Card><ErrorMessage message={task.error} /></>;
}
export function OnboardingScreen() {
  const nest = useNest(); const task = useTask();
  return <Page title={`Welcome, ${nest.user?.name.split(' ')[0] || 'there'}`} subtitle="Every family has its own rhythm. Let's find yours." action={<Button title="Sign out" variant="ghost" onPress={() => void task.run(nest.logout)} />}><HouseholdJoinCreate /><ErrorMessage message={task.error || nest.error} /></Page>;
}
