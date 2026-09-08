import { canWrite } from '@nestwise/shared';
import { CareNavigationProvider, ChildSwitcher, FastLog } from './CareNavigation';
import { FoodLibrary } from './FoodLibrary';
import { useEffect, useState } from 'react';
import { Platform, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Slot, usePathname, useRouter, type Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNest } from '../lib/store';
import { usePalette } from '../theme';
import { AuthScreen } from '../screens/AuthScreen';
import { OnboardingScreen } from '../screens/OnboardingScreen';
import { Button, Dialog, ErrorMessage, Label, Loading, Row, useTask } from './ui';

const routes = [
  { path: '/', label: 'Overview', icon: 'grid-outline' },
  { path: '/timeline', label: 'Timeline', icon: 'time-outline' },
  { path: '/reports', label: 'Reports', icon: 'bar-chart-outline' },
  { path: '/children', label: 'Children', icon: 'happy-outline' },
  { path: '/household', label: 'Household', icon: 'people-outline' },
  { path: '/reminders', label: 'Reminders', icon: 'notifications-outline' },
  { path: '/settings', label: 'Settings', icon: 'options-outline' },
] as const;

export function Shell() { return <CareNavigationProvider><ShellContent /></CareNavigationProvider>; }
function ShellContent() {
  useEffect(()=>{if(Platform.OS!=='web')return;const style=document.createElement('style');style.textContent='*:focus-visible { outline: 3px solid #7C6797 !important; outline-offset: 3px !important; } @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; scroll-behavior: auto !important; } }';document.head.appendChild(style);return()=>style.remove();},[]);
  const nest = useNest(); const c = usePalette(); const { width } = useWindowDimensions();
  const desktop = width >= 900; const router = useRouter(); const pathname = usePathname();
  const [log,setLog]=useState(false);const [foods,setFoods]=useState(false);
  const [menu, setMenu] = useState(false); const [switcher, setSwitcher] = useState(false); const task = useTask();
  const navigate = (path: string) => { router.push(path as Href); setMenu(false); };
  const navItem = (route: typeof routes[number], mobile = false) => {
    const selected = pathname === route.path;
    return <Pressable key={route.path} accessibilityRole="link" accessibilityLabel={route.label} accessibilityState={{ selected }} onPress={() => navigate(route.path)}
      style={{ flexDirection: mobile ? 'column' : 'row', alignItems: 'center', gap: mobile ? 5 : 13, padding: mobile ? 10 : 13, borderRadius: 12, backgroundColor: selected ? c.sage : 'transparent', ...(mobile ? { flex: 1 } : {}) }}>
      <Ionicons name={route.icon} size={mobile ? 21 : 20} color={selected ? c.primary : c.muted} /><Text style={{ fontSize: mobile ? 10 : 14, fontWeight: selected ? '600' : '400', color: selected ? c.text : c.muted }}>{mobile && route.path==='/'?'Home':route.label}</Text>
    </Pressable>;
  };
  let content;
  if (pathname === '/account' || (pathname === '/join' && nest.user)) content = <Slot />;
  else if (nest.loading && !nest.user) content = <Loading />;
  else if (!nest.user) content = <AuthScreen />;
  else if (nest.loading && !nest.snapshot) content = <Loading />;
  else if (!nest.households.length) content = <OnboardingScreen />;
  else content = <View style={{ flex: 1, flexDirection: 'row' }}>
    {desktop && <View style={{ width: 232, padding: 22, borderRightWidth: 1, borderColor: c.border, backgroundColor: c.surface, gap: 28 }}>
      <Row style={{ paddingVertical: 16 }}><Ionicons name="leaf" size={29} color={c.primary} /><Text style={{ color: c.text, fontSize: 25, fontWeight: '600', letterSpacing: -1 }}>nestwise</Text></Row>
      <View style={{ gap: 6 }}>{routes.slice(0, 3).map(route => navItem(route))}</View>
      <View style={{ gap: 6 }}><Label muted style={{ fontSize: 10, letterSpacing: 2, padding: 12 }}>YOUR NEST</Label>{routes.slice(3).map(route => navItem(route))}</View>
      <View style={{ flex: 1 }} />
      <View style={{ backgroundColor: c.lavender, borderRadius: 16, padding: 16, gap: 8 }}><Ionicons name="sparkles-outline" size={22} color={c.primary} /><Label style={{ fontWeight: '600' }}>A little more in sync.</Label><Label muted style={{ fontSize: 12 }}>Small moments, shared care. Your family's day in one place.</Label></View>
      <Label muted style={{ fontSize: 11 }}>Made for your everyday.</Label>
    </View>}
    <View style={{ flex: 1, minWidth: 0 }}>
      <Row style={{ paddingHorizontal: desktop ? 28 : 16, paddingVertical: 13, borderBottomWidth: 1, borderColor: c.border, backgroundColor: c.surface, justifyContent: 'space-between' }}>
        {!desktop ? <ChildSwitcher/> : <Pressable accessibilityRole="button" accessibilityLabel="Switch household" onPress={() => setSwitcher(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 9, minHeight: 44, flexShrink: 1 }}>
          <View style={{ width: 33, height: 33, borderRadius: 11, backgroundColor: c.sage, justifyContent: 'center', alignItems: 'center' }}><Ionicons name="home-outline" size={17} color={c.primary} /></View>
          <Label style={{ fontWeight: '600', flexShrink: 1 }}>{nest.snapshot?.household.name || 'Choose household'}</Label><Ionicons name="chevron-down" size={14} color={c.muted} />
        </Pressable>}
        <Row><View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: nest.online ? c.primary : c.danger }} />{desktop && <Label muted style={{ fontSize: 12 }}>{!nest.online ? nest.connection==='offline'?'Offline':'Server unreachable' : nest.syncing ? 'Syncing' : (nest.queue.length+nest.foodQueue.length) ? `${nest.queue.length+nest.foodQueue.length} queued` : nest.realtime === 'connected' ? 'All up to date' : 'Live updates: ' + nest.realtime}</Label>}
          <Pressable accessibilityRole="button" accessibilityLabel="Open settings" onPress={() => navigate('/settings')} style={{ backgroundColor: c.lavender, width: 44, height: 44, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }}><Label style={{ fontWeight: '600' }}>{nest.user.name.slice(0, 1).toUpperCase()}</Label></Pressable>
        </Row>
      </Row>
      {(!nest.online || (nest.conflicts.length+nest.foodConflicts.length) > 0) && <Pressable accessibilityRole="button" onPress={() => navigate('/settings')} style={{ padding: 11, backgroundColor: c.peach }}><Label style={{ fontSize: 12, textAlign: 'center' }}>{(nest.conflicts.length+nest.foodConflicts.length) ? `${nest.conflicts.length+nest.foodConflicts.length} sync conflict(s) need your attention. Review in Settings.` : nest.connection==='offline' ? 'You are offline. Care logs are saved on this device and will sync when connected.' : 'The server is temporarily unreachable. Saved care remains on this device.'}</Label></Pressable>}
      {nest.error && <View style={{ padding: 12 }}><ErrorMessage message={nest.error} /><Button title="Dismiss" variant="ghost" onPress={nest.clearError} /></View>}
      {nest.snapshot ? <Slot /> : <View style={{ padding: 24, gap: 16 }}><ErrorMessage message={task.error || 'Your household could not be loaded. Check your connection and try again.'} /><Button title="Try again" disabled={task.pending} onPress={() => void task.run(() => nest.refresh())} /></View>}
      {!desktop && <Row style={{ flexWrap: 'nowrap', gap: 0, padding: 5, backgroundColor: c.surface, borderTopWidth: 1, borderColor: c.border }}>{routes.slice(0, 2).map(route => navItem(route, true))}{canWrite(nest.snapshot?.household.role||'viewer') && <Pressable accessibilityRole="button" accessibilityLabel="Log" onPress={()=>setLog(true)} style={({pressed})=>({flex:1,alignItems:'center',gap:3,opacity:pressed?0.7:1})}><View style={{backgroundColor:c.primary,width:48,height:44,borderRadius:16,alignItems:'center',justifyContent:'center'}}><Ionicons name="add" size={29} color={c.primaryText}/></View><Label style={{fontSize:11,fontWeight:'600'}}>Log</Label></Pressable>}{navItem(routes[2],true)}<Pressable accessibilityRole="button" accessibilityLabel="More" onPress={() => setMenu(true)} style={{ flex: 1, alignItems: 'center', gap: 5, padding: 10 }}><Ionicons name="menu-outline" size={21} color={c.muted} /><Label muted style={{ fontSize: 10 }}>More</Label></Pressable></Row>}
    </View>
  </View>;
  return <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}><StatusBar style={c.bg === '#18231F' ? 'light' : 'dark'} />{nest.connection==='waking'&&<View accessibilityLiveRegion="polite" style={{padding:12,backgroundColor:c.sage}}><Label>NestWise is waking up. Your saved care stays safe while we reconnect.</Label></View>}{content}
    <Dialog visible={menu} title="Your nest" onClose={() => setMenu(false)}>{routes.slice(3).map(route => navItem(route))}<Button title="Food Library" variant="secondary" onPress={()=>{setMenu(false);setFoods(true);}}/><Button title="Privacy / Exports" variant="ghost" onPress={()=>navigate('/settings')}/><Button title="Switch household" variant="ghost" onPress={()=>{setMenu(false);setSwitcher(true);}}/></Dialog>{log&&<FastLog onClose={()=>setLog(false)}/ >}{foods&&<FoodLibrary onClose={()=>setFoods(false)}/ >}
    <Dialog visible={switcher} title="Your households" onClose={() => setSwitcher(false)}><ErrorMessage message={task.error} />{nest.households.map(h => <Button key={h.id} title={`${h.name} (${h.role})${h.id === nest.householdId ? ' - current' : ''}`} variant="secondary" disabled={task.pending} onPress={() => void task.run(async () => { await nest.selectHousehold(h.id); setSwitcher(false); })} />)}<Button title="Create or join a household" variant="ghost" onPress={() => { setSwitcher(false); navigate('/household'); }} /></Dialog>
  </SafeAreaView>;
}
