import { MobileHome } from '../src/components/MobileHome';
import { sleepHours } from '../src/lib/report';
import { dayStart, localDay } from '../src/lib/report-model';
import { useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { canWrite, predictRoutines, sharedWindow, type Category } from '@nestwise/shared';
import { useNest } from '../src/lib/store';
import { Button, Card, Empty, Heading, Label, Page, Row } from '../src/components/ui';
import { EventEditor } from '../src/components/EventEditor';
import { formatTime } from '../src/theme';
import { useRouter } from 'expo-router';

export default function Overview() { const mobile=useWindowDimensions().width<900;return mobile?<MobileHome/>:<DesktopOverview/>; }
function DesktopOverview() {
  const nest = useNest(); const snapshot = nest.snapshot!; const [editor, setEditor] = useState(false); const [quick,setQuick]=useState<{category:Category;childIds:string[]} | null>(null); const router = useRouter();
  const wide = useWindowDimensions().width >= 1000; const children = snapshot.children.filter(c => c.active);
  const predictions = children.flatMap(c => predictRoutines(snapshot.events, c.id, new Date(), { timezone: c.timezone || snapshot.household.timezone, dateOfBirth: c.dateOfBirth }));
  const overlap = sharedWindow(predictions.filter(p => p.type === 'nap'));
  return <Page title="A little more in sync." subtitle={`${snapshot.household.name} · Your family’s recorded rhythms, together.`} action={canWrite(snapshot.household.role) ? <Button title="Log care" icon="add" disabled={!children.length} onPress={() => setEditor(true)} /> : undefined}>
    {!children.length ? <Empty title="Welcome to your nest" description="Add your children to start sharing care. Twins and siblings can be included in the same log." action={<Button title="Add a child" onPress={() => router.push('/children')} />} /> : <View style={{ flexDirection: wide ? 'row' : 'column', gap: 20 }}>
      <View style={{ ...(wide ? { flex: 2 } : {}), gap: 20 }}>{children.map(child => {
        const events = snapshot.events.filter(e => !e.deletedAt && e.childIds.includes(child.id)).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
        const today = new Intl.DateTimeFormat('en-CA', { timeZone: snapshot.household.timezone });
        const todaysEvents = events.filter(e => Date.parse(e.occurredAt) <= Date.now() && today.format(new Date(e.occurredAt)) === today.format(new Date()));
        const count = todaysEvents.length; const sleep = sleepHours(events, child.id, dayStart(localDay(Date.now(), snapshot.household.timezone), snapshot.household.timezone), Date.now());
        return <Card key={child.id}><Row style={{ justifyContent: 'space-between' }}><Heading small>{child.firstName}</Heading><Label muted>{count} logs today</Label></Row>
          <Label>{events.length ? `Last recorded: ${events[0].category} at ${formatTime(events[0].occurredAt, snapshot.household.timezone)}` : 'Their first moment is waiting to be recorded.'}</Label>
          {canWrite(snapshot.household.role) && <Row>{(['bottle','diaper','food','sleep','nursing','pumping'] as const).map(category=><Button key={category} title={'Log '+category+' for '+child.firstName} variant="secondary" compact onPress={()=>setQuick({category,childIds:[child.id]})} />)}</Row>}
          <Row><Label>Recorded today: {sleep.toFixed(1)}h completed sleep</Label><Label>{todaysEvents.filter(e => ['bottle','nursing','food'].includes(e.category)).length} feeds</Label><Label>{todaysEvents.filter(e => e.category === 'diaper').length} diapers</Label></Row>
          {predictions.filter(p => p.childId === child.id).map(p => <View key={p.type} style={{ gap: 6 }}><Label style={{ fontWeight: '600' }}>{p.type}: {formatTime(p.windowStart, snapshot.household.timezone)}–{formatTime(p.windowEnd, snapshot.household.timezone)}</Label><Label muted>{p.explanation} Pattern confidence: {Math.round(p.confidence * 100)}% (not a calibrated probability).</Label>{p.typicalDurationMinutes !== undefined && <Label muted>Typical recorded nap: {Math.round(p.typicalDurationMinutes)} minutes.</Label>}{p.driftMinutes !== null && <Label muted>Recent spacing changed by {p.driftMinutes > 0 ? "+" : ""}{p.driftMinutes} minutes.</Label>}</View>)}
          {!predictions.some(p => p.childId === child.id) && <Label muted>No current estimate. More complete recent logs may help; ongoing timers, sparse history or expired estimates can also prevent a prediction.</Label>}
        </Card>;
      })}</View>
      <View style={{ ...(wide ? { flex: 1 } : {}), gap: 20 }}><Card tone="sage"><Heading small>Shared rhythms</Heading><Label>{overlap?.explanation || 'When two children have enough nap history, their overlapping windows appear here.'}</Label>{overlap?.targetAt && <Label>Shared target: {formatTime(overlap.targetAt, snapshot.household.timezone)}</Label>}<Label muted>Estimates describe recorded patterns. Follow your children’s cues; these are not medical or feeding recommendations.</Label></Card>
        <Card tone="lavender"><Heading small>Coming up</Heading>{snapshot.reminders.filter(r => !r.completedAt).sort((a, b) => a.dueAt.localeCompare(b.dueAt)).slice(0, 4).map(r => <Label key={r.id}>{r.title} · {new Date(r.dueAt).toLocaleString()}</Label>)}{!snapshot.reminders.some(r => !r.completedAt) && <Label muted>No open reminders.</Label>}<Button title="Manage reminders" variant="secondary" onPress={() => router.push('/reminders')} /></Card></View>
    </View>}{editor && <EventEditor onClose={() => setEditor(false)} />}{quick && <EventEditor initialCategory={quick.category} initialChildIds={quick.childIds} onClose={()=>setQuick(null)} />}
  </Page>;
}
