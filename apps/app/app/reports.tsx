import { useState } from 'react';
import { Platform, Share } from 'react-native';
import { useNest } from '../src/lib/store';
import { exportCsv, sleepHours } from '../src/lib/report';
import { Button, Card, Choice, ErrorMessage, Heading, Label, Page, useTask } from '../src/components/ui';
export default function Reports() {
  const nest = useNest(); const snapshot = nest.snapshot!; const task = useTask(); const [child, setChild] = useState('all'); const [days, setDays] = useState('7');
  const start = Date.now() - Number(days) * 86400000;
  const events = snapshot.events.filter(e => !e.deletedAt && Date.parse(e.occurredAt) >= start && Date.parse(e.occurredAt) <= Date.now() && (child === 'all' || e.childIds.includes(child)));
  return <Page title="Their story, recorded" subtitle="Counts reflect recorded care only. Shared sibling logs count once per child; missing logs are not zero care." action={<Button title="Export care CSV" onPress={() => void task.run(async () => { const csv = exportCsv(events, snapshot.children); if (Platform.OS === 'web') { const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); const a = document.createElement('a'); a.href = url; a.download = 'nestwise-care-report.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); } else await Share.share({ message: csv, title: 'NestWise care report' }); })} />}>
    <Card><Choice label="Child" value={child} options={[{ value: 'all', label: 'All children' }, ...snapshot.children.map(c => ({ value: c.id, label: c.firstName }))]} onChange={setChild} /><Choice label="Period" value={days} options={[{ value: '7', label: 'Last 7 days' }, { value: '14', label: 'Last 14 days' }, { value: '30', label: 'Last 30 days' }]} onChange={setDays} /></Card>
    {snapshot.children.filter(c => child === 'all' || c.id === child).map(c => { const logs = events.filter(e => e.childIds.includes(c.id)); const sleep = sleepHours(snapshot.events, c.id, start, Date.now()); return <Card key={c.id}><Heading small>{c.firstName}</Heading><Label>{logs.length} recorded events · {sleep.toFixed(1)} hours of completed sleep in this period</Label>{[...new Set(logs.map(e => e.category))].map(category => <Label key={category}>{category}: {logs.filter(e => e.category === category).length}</Label>)}{!logs.length && <Label>No care recorded in this period.</Label>}</Card>; })}
    <Label muted>CSV includes dates, quantities, units, notes and caregivers for pediatrician review. Review the file before sharing private family information.</Label><ErrorMessage message={task.error} />
  </Page>;
}
