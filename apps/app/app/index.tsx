import { useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { canWrite, predictRoutines, sharedWindow } from '@nestwise/shared';
import { useNest } from '../src/lib/store';
import { Button, Card, Empty, Heading, Label, Page, Row } from '../src/components/ui';
import { EventEditor } from '../src/components/EventEditor';
import { formatTime } from '../src/theme';
import { useRouter } from 'expo-router';

export default function Overview() {
  const nest = useNest(); const snapshot = nest.snapshot!; const [editor, setEditor] = useState(false); const router = useRouter();
  const wide = useWindowDimensions().width >= 1000; const children = snapshot.children.filter(c => c.active);
  const predictions = children.flatMap(c => predictRoutines(snapshot.events, c.id));
  const overlap = sharedWindow(predictions.filter(p => p.type === 'nap'));
  return <Page title="A little more in sync." subtitle={`${snapshot.household.name} · Your family’s recorded rhythms, together.`} action={canWrite(snapshot.household.role) ? <Button title="Log care" icon="add" disabled={!children.length} onPress={() => setEditor(true)} /> : undefined}>
    {!children.length ? <Empty title="Welcome to your nest" description="Add your children to start sharing care. Twins and siblings can be included in the same log." action={<Button title="Add a child" onPress={() => router.push('/children')} />} /> : <View style={{ flexDirection: wide ? 'row' : 'column', gap: 20 }}>
      <View style={{ flex: 2, gap: 20 }}>{children.map(child => {
        const events = snapshot.events.filter(e => !e.deletedAt && e.childIds.includes(child.id)).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
        const today = new Intl.DateTimeFormat('en-CA', { timeZone: snapshot.household.timezone });
        const count = events.filter(e => today.format(new Date(e.occurredAt)) === today.format(new Date())).length;
        return <Card key={child.id}><Row style={{ justifyContent: 'space-between' }}><Heading small>{child.firstName}</Heading><Label muted>{count} logs today</Label></Row>
          <Label>{events.length ? `Last recorded: ${events[0].category} at ${formatTime(events[0].occurredAt, snapshot.household.timezone)}` : 'Their first moment is waiting to be recorded.'}</Label>
          {predictions.filter(p => p.childId === child.id).map(p => <View key={p.type} style={{ gap: 6 }}><Label style={{ fontWeight: '600' }}>{p.type}: {formatTime(p.windowStart, snapshot.household.timezone)}–{formatTime(p.windowEnd, snapshot.household.timezone)}</Label><Label muted>{p.explanation} Pattern confidence: {Math.round(p.confidence * 100)}%.</Label></View>)}
          {!predictions.some(p => p.childId === child.id) && <Label muted>Routine Intelligence needs at least five qualifying sessions with consistent intervals. No current estimate yet.</Label>}
        </Card>;
      })}</View>
      <View style={{ flex: 1, gap: 20 }}><Card tone="sage"><Heading small>Shared rhythms</Heading><Label>{overlap?.explanation || 'When two children have enough nap history, their overlapping windows appear here.'}</Label>{overlap?.targetAt && <Label>Shared target: {formatTime(overlap.targetAt, snapshot.household.timezone)}</Label>}<Label muted>Estimates describe recorded patterns. Follow your children’s cues; these are not medical or feeding recommendations.</Label></Card>
        <Card tone="lavender"><Heading small>Coming up</Heading>{snapshot.reminders.filter(r => !r.completedAt).sort((a, b) => a.dueAt.localeCompare(b.dueAt)).slice(0, 4).map(r => <Label key={r.id}>{r.title} · {new Date(r.dueAt).toLocaleString()}</Label>)}{!snapshot.reminders.some(r => !r.completedAt) && <Label muted>No open reminders.</Label>}<Button title="Manage reminders" variant="secondary" onPress={() => router.push('/reminders')} /></Card></View>
    </View>}{editor && <EventEditor onClose={() => setEditor(false)} />}
  </Page>;
}
