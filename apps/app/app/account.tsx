import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useNest } from '../src/lib/store';
import { Button, Card, Choice, ErrorMessage, Field, Label, Page, useTask } from '../src/components/ui';
export default function AccountHelp() {
  const params = useLocalSearchParams<{ token?: string; mode?: string }>(); const nest = useNest(); const router = useRouter(); const task = useTask();
  const [mode, setMode] = useState(params.mode === 'verify' ? 'verify' : params.token ? 'reset' : 'request');
  const [token, setToken] = useState(params.token || ''); const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [confirm, setConfirm] = useState(''); const [message, setMessage] = useState('');
  return <Page title="A little help signing in" subtitle="Recover access or confirm your email address securely."><Card>
    <Choice label="What would you like to do?" value={mode} options={[{value:'request',label:'Send recovery email'},{value:'reset',label:'Reset password'},{value:'verify',label:'Verify email'}]} onChange={value=>{setMode(value);setMessage('');task.setError(null);}} />
    {mode==='request' ? <Field label="Account email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" /> : <Field label="Code from your email" value={token} onChangeText={setToken} autoCapitalize="none" autoCorrect={false} secureTextEntry />}
    {mode==='reset' && <><Field label="New password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" hint="At least 12 characters." /><Field label="Confirm new password" value={confirm} onChangeText={setConfirm} secureTextEntry autoComplete="new-password" /></>}
    <ErrorMessage message={task.error} />{message && <Label>{message}</Label>}
    <Button title={task.pending?'Please wait…':mode==='request'?'Send recovery instructions':mode==='verify'?'Confirm email':'Save new password'} disabled={task.pending} onPress={()=>void task.run(async()=>{
      if(mode==='request') { const capabilities=await nest.request<{mailAvailable:boolean}>('/auth/recovery-capabilities'); if(!capabilities.mailAvailable) throw new Error('Email recovery is not available on this installation yet. No message has been sent.'); const result=await nest.request<{message:string}>('/auth/request-reset',{method:'POST',body:{email:email.trim()}});setMessage(result.message); }
      else { if(mode==='reset' && password!==confirm) throw new Error('The passwords do not match.'); await nest.request(mode==='verify'?'/auth/verify-email':'/auth/reset-password',{method:'POST',body:{token:token.trim(),...(mode==='reset'?{password}:{})}});setToken('');setPassword('');setConfirm('');setMessage(mode==='verify'?'Your email address is verified.':'Your password has been changed. Sign in again on each device.'); }
    })} />
    <Label muted>Codes expire after 30 minutes and can be used once. NestWise never asks you to share a recovery code with another caregiver.</Label>
    <Button title="Back to NestWise" variant="secondary" onPress={()=>router.replace('/')} />
  </Card></Page>;
}
