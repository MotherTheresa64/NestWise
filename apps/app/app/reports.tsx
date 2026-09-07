import { File } from 'expo-file-system';
import { DateField } from '../src/components/DateField';
import { useState } from 'react';
import { Platform, Share, View } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useNest } from '../src/lib/store';
import { exportCsv } from '../src/lib/report';
import { localDay, makeReport, reportDisclaimer, reportHtml, reportSections, shiftDay, type CareReport, type ReportSection } from '../src/lib/report-model';
import { Button, Card, Choice, ErrorMessage, Heading, Label, Page, Row, useTask } from '../src/components/ui';
import { usePalette } from '../src/theme';

export default function Reports() {
  const nest = useNest(); const snapshot = nest.snapshot!; const task = useTask(); const palette = usePalette();
  const [customize, setCustomize] = useState(false); const [chart, setChart] = useState('entries');
  const [child, setChild] = useState('all'); const [period, setPeriod] = useState('week');
  const today = localDay(Date.now(), snapshot.household.timezone);
  const [from, setFrom] = useState(shiftDay(today, -6)); const [through, setThrough] = useState(today);
  const [sections, setSections] = useState<ReportSection[]>([...reportSections]); const [notes, setNotes] = useState('no'); const [feedback, setFeedback] = useState('');
  const valueForDay = (day: CareReport['children'][number]['days'][number]) => chart === 'sleep' ? day.sleep : chart === 'entries' ? day.count : day.sectionCounts[chart as ReportSection] || 0;
  let report: CareReport | undefined; let rangeError: string | undefined;
  try { report = makeReport(snapshot.events, snapshot.children.filter(c => child === 'all' || c.id === child), from, through, snapshot.household.timezone, sections); } catch (error) { rangeError = (error as Error).message; }
  const exportPdf = async () => {
    if (!report) return;
    const html = reportHtml(report, notes === 'yes', !!nest.queue.length || !!nest.conflicts.length);
    if (Platform.OS === 'web') {
      const preview = window.open('', '_blank');
      if (!preview) throw new Error('Allow pop-ups for NestWise to open your print preview.');
      preview.opener = null; preview.document.open(); preview.document.write(html); preview.document.close();
      preview.focus(); preview.print(); setFeedback('Choose Save as PDF in the print window. Close the report tab when finished.');
    } else {
      if (!await Sharing.isAvailableAsync()) throw new Error('File sharing is not available on this device.');
      const file = await Print.printToFileAsync({ html });
      try { await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', UTI: '.pdf', dialogTitle: 'Share care report' }); } finally { new File(file.uri).delete(); }
      setFeedback('Your care report is ready to share.');
    }
  };
  return <Page title="Their story, recorded" subtitle="A clear picture of recorded care, ready for your next conversation." action={<Button title={task.pending ? 'Preparing report…' : 'Export pediatrician PDF'} disabled={task.pending || !report || !sections.length} onPress={() => void task.run(exportPdf)} />}>
    <Card><Choice label="Child" value={child} options={[{ value: 'all', label: 'All children' }, ...snapshot.children.map(c => ({ value: c.id, label: c.firstName }))]} onChange={setChild} />
      <Choice label="Period" value={period} options={[{ value: 'day', label: 'Today' }, { value: 'week', label: 'Last 7 days' }, { value: 'month', label: 'Last 30 days' }, { value: 'custom', label: 'Custom range' }]} onChange={value => { setPeriod(value); if (value !== 'custom') { setFrom(shiftDay(today, value === 'day' ? 0 : value === 'week' ? -6 : -29)); setThrough(today); } }} />
      {period === 'custom' && <Row><DateField label="From date" value={from} onChangeText={setFrom} hint="YYYY-MM-DD" /><DateField label="Through date" value={through} onChangeText={setThrough} hint="YYYY-MM-DD, inclusive" /></Row>}
      <Label muted>{from} through {through} · {snapshot.household.timezone}</Label>
      <Button title={customize ? "Hide report options" : "Customize report sections and privacy"} variant="secondary" onPress={() => setCustomize(!customize)} />{customize && <><Choice multiple label="Report sections" value={sections} options={reportSections.map(value => ({ value, label: value[0].toUpperCase() + value.slice(1) }))} onChange={value => { setSections(old => old.includes(value) ? old.filter(s => s !== value) : [...old, value]); setChart("entries"); }} />
      <Choice label="Include private notes in PDF" value={notes} options={[{ value: 'no', label: 'Exclude notes' }, { value: 'yes', label: 'Include notes' }]} onChange={setNotes} />
      <Label muted>{reportDisclaimer}</Label></>}<ErrorMessage message={rangeError || task.error} />{feedback && <Label>{feedback}</Label>}
      {!!(nest.queue.length || nest.conflicts.length) && <Label>Includes local changes. Finish synchronization and resolve conflicts before sharing a final report.</Label>}
    </Card>
    {report?.children.map(({ child: c, summaries, days }) => <Card key={c.id}><Heading small>{c.firstName}</Heading>
      <Label muted>Shared sibling entries count once per child. Active sleep timers are excluded from duration.</Label>
      <Row style={{ alignItems: 'stretch' }}>{summaries.map(s => <View key={s.section} style={{ flexGrow: 1, flexBasis: 220, backgroundColor: palette.soft, borderRadius: 14, padding: 16, gap: 8 }}><Heading small>{s.section[0].toUpperCase() + s.section.slice(1)}</Heading><Label>{s.count ? `${s.count} recorded entries` : 'No entries recorded'}</Label>{s.sleepHours !== null && <Label>{s.sleepHours.toFixed(1)} hours of completed sleep</Label>}{s.quantities.map(q => <Label key={q.label}>{q.label}: {q.total.toFixed(1)}</Label>)}{['temperature','growth'].includes(s.section) && s.observations.map(o=><Label key={o.label}>{o.label}: {o.min === o.max ? o.min : `${o.min}–${o.max}`} recorded range</Label>)}{['medicine', 'symptoms', 'temperature', 'growth'].includes(s.section) && s.records.slice().sort((a,b) => b.occurredAt.localeCompare(a.occurredAt)).slice(0, 3).map(e => <Label key={e.id}>{localDay(Date.parse(e.occurredAt), report!.timezone)} · {Object.values(e.details).join(' · ')}</Label>)}</View>)}</Row>
      <Heading small>Recorded care by day</Heading><Choice label="Chart" value={chart} options={[{value:"entries",label:"Entry count"}, ...sections.map(value => ({value, label:value === 'sleep' ? 'Completed sleep hours' : `${value[0].toUpperCase() + value.slice(1)} entries`}))]} onChange={setChart} /><Label muted>These bars show recorded care only. A dash means no matching care was recorded.</Label>
      {days.map(day => <Row key={day.day}><Label style={{ width: 84 }}>{day.day.slice(5)}</Label><View style={{ flex: 1, height: 14, borderRadius: 7, backgroundColor: palette.soft }}><View style={{ width: `${valueForDay(day) / Math.max(1, ...days.map(valueForDay)) * 100}%`, height: 14, borderRadius: 7, backgroundColor: palette.primary }} /></View><Label style={{ width: 34, textAlign: 'right' }}>{valueForDay(day) ? chart === 'sleep' ? valueForDay(day).toFixed(1) : valueForDay(day) : '—'}</Label></Row>)}
    </Card>)}
    {!sections.length && <Label>Select at least one section to build your report.</Label>}
    <Button title="Export care CSV" variant="secondary" disabled={!report || task.pending} onPress={() => void task.run(async () => { const csv = exportCsv(report!.logs, snapshot.children); if (Platform.OS === 'web') { const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); const a = document.createElement('a'); a.href = url; a.download = 'nestwise-care-report.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); } else await Share.share({ message: csv, title: 'NestWise care report' }); })} />
    <Label muted>CSV includes notes and caregivers. Review exported files before sharing private family information.</Label>
  </Page>;
}
