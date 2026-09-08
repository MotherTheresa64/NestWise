import { createContext, useContext, useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { categories, eventSummary, type Category, type CareEvent } from '@nestwise/shared';
import { useNest } from '../lib/store';
import { categoryIcons, categoryLabels, formatTime, usePalette } from '../theme';
import { Button, Choice, Dialog, Label, Row } from './ui';
import { EventEditor } from './EventEditor';

const ChildContext=createContext({childId:'',selectChild:(_id:string)=>{}});
export function CareNavigationProvider({children}:{children:ReactNode}) {
  const nest=useNest(); const [selection,setSelection]=useState({household:'',child:''});
  const active=nest.snapshot?.children.filter(c=>c.active)||[];
  const childId=selection.household===nest.householdId&&active.some(c=>c.id===selection.child)?selection.child:active[0]?.id||'';
  return <ChildContext.Provider value={{childId,selectChild:child=>setSelection({household:nest.householdId||'',child})}}>{children}</ChildContext.Provider>;
}
export const useCareChild=()=>useContext(ChildContext);
export function ChildSwitcher() {
  const nest=useNest();const c=usePalette();const {childId,selectChild}=useCareChild();const [open,setOpen]=useState(false);
  const children=nest.snapshot?.children.filter(c=>c.active)||[];const child=children.find(c=>c.id===childId);
  return <><Pressable accessibilityRole="button" accessibilityLabel={`Switch child: ${child?.firstName||'Choose child'}`} onPress={()=>setOpen(true)} style={({pressed})=>({flexDirection:'row',alignItems:'center',gap:10,minHeight:48,flexShrink:1,opacity:pressed?0.7:1})}>
    <View style={{width:42,height:42,borderRadius:16,backgroundColor:c.sage,alignItems:'center',justifyContent:'center'}}><Label style={{fontSize:20,fontWeight:'600'}}>{child?.firstName.slice(0,1)||'+'}</Label></View><View style={{flexShrink:1}}><Label style={{fontSize:17,fontWeight:'600'}}>{child?.firstName||'Choose child'}</Label><Label muted style={{fontSize:11}}>{nest.snapshot?.household.name}</Label></View><Ionicons name="chevron-down" size={16} color={c.text}/></Pressable>
    <Dialog visible={open} title="Who are we caring for?" onClose={()=>setOpen(false)}>{children.map(ch=><Button key={ch.id} title={`Select ${ch.firstName}${ch.id===childId?' · current':''}`} variant="secondary" onPress={()=>{selectChild(ch.id);setOpen(false);}}/>)}{!children.length&&<Label>Add a child from More → Children to begin.</Label>}<Label muted>You can include siblings together in every care form.</Label></Dialog></>;
}
const order:Category[]=['sleep','bottle','nursing','food','diaper','pumping','potty','medicine','temperature','growth','symptom','bath','teeth','milestone','routine','water','custom'];
export function CareTiles({onSelect,events=[],childName,small=false}:{onSelect:(category:Category)=>void;events?:CareEvent[];childName?:string;small?:boolean}){
  const c=usePalette();const timezone=useNest().snapshot?.household.timezone;
  return <View style={{flexDirection:'row',flexWrap:'wrap',gap:12}}>{order.map((category,index)=>{
    const last=events.filter(e=>!e.deletedAt&&e.category===category&&Date.parse(e.occurredAt)<=Date.now()).sort((a,b)=>b.occurredAt.localeCompare(a.occurredAt))[0];
    const tone=index%4===0?c.sage:index%4===1?c.peach:index%4===2?c.lavender:c.soft;
    return <Pressable key={category} accessibilityRole="button" accessibilityLabel={childName?`Log ${category} for ${childName}`:`Choose ${categoryLabels[category]}`} onPress={()=>onSelect(category)} style={({pressed})=>({flexBasis:'46%',flexGrow:1,minWidth:0,minHeight:small?90:132,padding:16,borderRadius:22,backgroundColor:tone,opacity:pressed?0.7:1,gap:10})}>
      <Row style={{justifyContent:'space-between'}}><Ionicons name={categoryIcons[category]||'sparkles-outline'} size={25} color={c.primary}/><Ionicons name="add" size={18} color={c.text}/></Row>
      <Label style={{fontSize:small?16:19,fontWeight:'600'}}>{categoryLabels[category]}</Label>
      {!small&&<Label muted style={{fontSize:12,lineHeight:17}}>{last?`${eventSummary(last)}\n${formatTime(last.occurredAt,timezone)} · ${new Date(last.occurredAt).toLocaleDateString([], {month:'short',day:'numeric',timeZone:timezone})}`:'No moment recorded yet'}</Label>}
    </Pressable>;
  })}</View>;
}
export function FastLog({onClose}:{onClose:()=>void}){
  const nest=useNest();const {childId}=useCareChild();const [category,setCategory]=useState<Category|null>(null);
  const child=nest.snapshot?.children.find(c=>c.id===childId);
  if(category)return <EventEditor initialCategory={category} initialChildIds={childId?[childId]:[]} onClose={onClose}/>;
  return <Dialog visible title="What happened?" onClose={onClose}><ChildSwitcher/><Label muted>Choose a moment for {child?.firstName||'your child'}. Review before saving.</Label><CareTiles small onSelect={setCategory}/></Dialog>;
}
export function CategoryFilter({value,onChange}:{value:string;onChange:(value:string)=>void}){
  const [open,setOpen]=useState(false);
  return <><Button title={value==='all'?'Filter categories':`Category: ${categoryLabels[value]}`} icon="filter-outline" variant="secondary" onPress={()=>setOpen(true)}/><Dialog visible={open} title="Filter care categories" onClose={()=>setOpen(false)}><Choice value={value} options={[{value:'all',label:'All care'},...categories.map(value=>({value,label:categoryLabels[value]}))]} onChange={v=>{onChange(v);setOpen(false);}}/></Dialog></>;
}
