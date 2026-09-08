import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { canWrite, predictRoutines, type Category } from '@nestwise/shared';
import { useNest } from '../lib/store';
import { formatTime, usePalette } from '../theme';
import { Button, Empty, Heading, Label, Page } from './ui';
import { CareTiles, useCareChild } from './CareNavigation';
import { EventEditor } from './EventEditor';

export function MobileHome(){
  const nest=useNest();const c=usePalette();const router=useRouter();const {childId}=useCareChild();const [category,setCategory]=useState<Category|null>(null);const [rhythm,setRhythm]=useState(false);
  const snapshot=nest.snapshot!;const child=snapshot.children.find(c=>c.id===childId);const writable=canWrite(snapshot.household.role);
  const events=snapshot.events.filter(e=>e.childIds.includes(childId));
  const predictions=child?predictRoutines(events,childId,new Date(),{timezone:child.timezone||snapshot.household.timezone,dateOfBirth:child.dateOfBirth}):[];
  const running=events.filter(e=>!e.deletedAt&&!e.endedAt&&['sleep','nursing','pumping'].includes(e.category));
  return <Page title={child?`${child.firstName}’s day`:'Welcome to your nest'} subtitle="Little moments. A shared picture.">
    {!child?<Empty title="Make room for their story" description="Add a child to start recording care together." action={<Button title="Add a child" onPress={()=>router.push('/children')}/>}/>:<>
      {!!running.length&&<View style={{backgroundColor:c.sage,padding:18,borderRadius:20,gap:10}}><Heading small>{running.length} timer{running.length===1?'':'s'} running</Heading>{running.map(e=><Label key={e.id}>{e.category} · since {formatTime(e.occurredAt,snapshot.household.timezone)}</Label>)}<Button title="Open running timers" onPress={()=>router.push('/timeline')}/></View>}
      <Button title={rhythm?'Hide recorded rhythms':'Upcoming rhythms'} variant="secondary" icon="sparkles-outline" onPress={()=>setRhythm(!rhythm)}/>
      {rhythm&&<View style={{gap:10,paddingHorizontal:4}}>{predictions.map(p=><Label key={p.type}>{p.type} · {formatTime(p.windowStart,snapshot.household.timezone)}–{formatTime(p.windowEnd,snapshot.household.timezone)}{ '\n'}{p.explanation}</Label>)}{!predictions.length&&<Label muted>More complete recent logs can help reveal a pattern.</Label>}<Label muted>Recorded patterns only. Follow your child’s cues.</Label></View>}
      {writable?<CareTiles childName={child.firstName} events={events} onSelect={setCategory}/>:<Empty title="Your shared view" description="Your role lets you review care. A household owner can change caregiver permissions." action={<Button title="View timeline" onPress={()=>router.push('/timeline')}/>}/>}</>}
    {category&&<EventEditor initialCategory={category} initialChildIds={[childId]} onClose={()=>setCategory(null)}/>}
  </Page>;
}
