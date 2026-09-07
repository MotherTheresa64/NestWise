import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useNest } from '../src/lib/store';
import { Button, Card, ErrorMessage, Field, Label, Page, useTask } from '../src/components/ui';
export default function JoinHousehold() {
 const params=useLocalSearchParams<{token?:string}>();const [token,setToken]=useState(params.token||'');const nest=useNest();const task=useTask();const router=useRouter();
 return <Page title="There is room in this nest" subtitle="Accept an invitation from someone you trust."><Card><Label>Signed in as {nest.user?.email}. This must match the email your caregiver invited. Invitations expire after seven days and can be accepted once.</Label><Field label="Invitation code" value={token} onChangeText={setToken} autoCapitalize="none" secureTextEntry /><ErrorMessage message={task.error} /><Button title="Join this household" disabled={task.pending || !token} onPress={()=>void task.run(async()=>{await nest.request('/invitations/accept',{method:'POST',body:{token:token.trim()}});setToken('');await nest.refresh();router.replace('/');})} /><Button title="Back to my nest" variant="secondary" onPress={()=>router.replace('/')} /></Card></Page>;
}
