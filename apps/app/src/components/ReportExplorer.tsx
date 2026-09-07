import { useState } from 'react';
import { View } from 'react-native';
import { canWrite, eventSummary, type CareEvent } from '@nestwise/shared';
import { useNest } from '../lib/store';
import { dayStart, localDay, shiftDay, type CareReport } from '../lib/report-model';
import { careBreakdown, hourDistribution } from '../lib/care-statistics';
import { formatTime, usePalette } from '../theme';
import { Button, Card } from './ui';
import { Dialog, Heading, Label, Row } from './ui';
import { DateField } from './DateField';
import { EventEditor } from './EventEditor';

export function ReportExplorer({report,view}:{report:CareReport;view:string}) {
  const nest=useNest();const c=usePalette();const [chosen,setChosen]=useState(report.through);const [selected,setSelected]=useState<CareEvent | null>(null);
  const day=chosen<report.from?report.from:chosen>report.through?report.through:chosen;
  const daily=report.logs.filter(e=>localDay(Date.parse(e.occurredAt),report.timezone)===day || e.category==='sleep' && e.endedAt && Date.parse(e.occurredAt)<dayStart(day,report.timezone) && Date.parse(e.endedAt)>dayStart(day,report.timezone));
  const records=view==='day'?daily:report.logs;
  const dates=[...new Set(records.map(e=>localDay(Date.parse(e.occurredAt),report.timezone)))].sort().reverse();
  const weekEnd=day;const weekStart=shiftDay(weekEnd,-6)<report.from?report.from:shiftDay(weekEnd,-6);const week:string[]=[];for(let d=weekStart;d<=weekEnd;d=shiftDay(d,1))week.push(d);
  const hourly=hourDistribution(report.logs,day,report.timezone);
  return <>
    {(view==='day'||view==='week') && <Card><DateField label={view==='day'?'Explore date':'Week ending'} value={day} onChangeText={value=>{if(/^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10)===value)setChosen(value);}} /><Row><Button title="Earlier" variant="secondary" disabled={day<=report.from} onPress={()=>setChosen(shiftDay(day,view==='week'?-7:-1))} /><Button title="Later" variant="secondary" disabled={day>=report.through} onPress={()=>setChosen(shiftDay(day,view==='week'?7:1))} /></Row><Label muted>Within the report range · {report.timezone}. Counts describe recorded starts, not recommendations.</Label></Card>}
    {view==='week' && <Card><Heading small>Care across the week</Heading><Label muted>Each row shows recorded starts by time of day. Repeated daylight-saving hours are combined; missing hours remain empty.</Label>{week.map(date=>{const hours=hourDistribution(report.logs,date,report.timezone);return <View key={date} style={{gap:8}}><Button title={`Explore ${date}`} variant="secondary" onPress={()=>setChosen(date)} /><Row>{[0,6,12,18].map(start=><View key={start} style={{flexBasis:110,flexGrow:1,padding:12,borderRadius:12,backgroundColor:c.soft}}><Label>{String(start).padStart(2,'0')}:00–{String(start+6).padStart(2,'0')}:00</Label><Label>{hours.slice(start,start+6).reduce((a,b)=>a+b,0)} entries</Label></View>)}</Row></View>;})}</Card>}
    {view==='day' && <Card><Heading small>Recorded on {day}</Heading><Row>{careBreakdown(daily).map(item=><Label key={item.label}>{item.label}: {item.count}</Label>)}</Row><Heading small>Starts by hour</Heading>{hourly.map((count,hour)=><Row key={hour}><Label style={{width:48}}>{String(hour).padStart(2,'0')}:00</Label><View style={{height:10,flex:1,backgroundColor:c.soft,borderRadius:5}}><View style={{height:10,width:`${count/Math.max(1,...hourly)*100}%`,backgroundColor:c.primary,borderRadius:5}} /></View><Label style={{width:30}}>{count || '—'}</Label></Row>)}</Card>}
    {view!=='week' && <Card><Heading small>{view==='day'?'Care periods and entries':'Recorded care list'}</Heading>{!records.length && <Label>No care was recorded in this selection.</Label>}{dates.map(date=><View key={date} style={{gap:12}}><Heading small>{date}</Heading>{records.filter(e=>localDay(Date.parse(e.occurredAt),report.timezone)===date).sort((a,b)=>b.occurredAt.localeCompare(a.occurredAt)).map(e=><View key={e.id} style={{gap:6,paddingVertical:10,borderBottomWidth:1,borderColor:c.border}}><Label>{formatTime(e.occurredAt,report.timezone)}{e.endedAt?`–${formatTime(e.endedAt,report.timezone)}`:''} · {nest.snapshot!.children.filter(ch=>e.childIds.includes(ch.id)).map(ch=>ch.firstName).join(' & ')}</Label><Label>{eventSummary(e)}</Label><Button title="Open care details" variant="secondary" onPress={()=>setSelected(e)} /></View>)}</View>)}</Card>}
    {selected && (canWrite(nest.snapshot!.household.role)?<EventEditor existing={selected} onClose={()=>setSelected(null)} />:<Dialog visible title="Recorded care details" onClose={()=>setSelected(null)}><Label>{eventSummary(selected)}</Label><Label>{JSON.stringify(selected.details,null,2)}</Label><Label>{selected.notes}</Label></Dialog>)}
  </>;
}
