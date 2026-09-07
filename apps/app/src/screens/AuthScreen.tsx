import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { loginSchema, registerSchema } from '@nestwise/shared';
import { useNest } from '../lib/store';
import { usePalette } from '../theme';
import { Button, Card, ErrorMessage, Field, Heading, Label, Row, useTask } from '../components/ui';

export function AuthScreen() {
  const router = useRouter(); const nest = useNest(); const c = usePalette(); const wide = useWindowDimensions().width >= 850;
  const [register, setRegister] = useState(false); const [name, setName] = useState('');
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const task = useTask();
  const submit = () => void task.run(async () => {
    if (register) { const input = registerSchema.parse({ name, email: email.trim(), password }); await nest.register(input.name, input.email, input.password); }
    else { const input = loginSchema.parse({ email: email.trim(), password }); await nest.login(input.email, input.password); }
  });
  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: wide ? 60 : 24 }}>
    <Row style={{ maxWidth: 1120, width: '100%', alignSelf: 'center', alignItems: 'center', gap: 60 }}>
      <View style={{ flex: 1, minWidth: 260, gap: 30 }}><Row><Ionicons name="leaf" size={34} color={c.primary} /><Text style={{ color: c.text, fontSize: 30, fontWeight: '600', letterSpacing: -1 }}>nestwise</Text></Row>
        <Text style={{ fontSize: wide ? 58 : 38, lineHeight: wide ? 65 : 44, letterSpacing: -2, color: c.text, fontWeight: '500' }}>Their little world.{'\n'}A little more in sync.</Text>
        <Label muted style={{ maxWidth: 400, fontSize: 17, lineHeight: 27 }}>A calm place to track the everyday, share the care, and find your family's rhythm.</Label>
        {wide && <Card tone="sage" style={{ maxWidth: 380 }}><Ionicons name="sunny-outline" size={32} color={c.primary} /><Heading small>Less remembering. More being there.</Heading><Label muted>Sleep, feeds, little firsts. Keep everyone who cares in the loop, wherever the day takes you.</Label></Card>}
      </View>
      <Card style={{ flex: 1, minWidth: 260, maxWidth: 460, padding: wide ? 32 : 22 }}><Heading>{register ? 'Make yourself at home' : 'Welcome back'}</Heading><Label muted>{register ? 'Start a shared space for your family.' : 'A fresh look at your family’s day.'}</Label>
        {register && <Field label="Your name" value={name} onChangeText={setName} autoComplete="name" />}
        <Field label="Email address" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" />
        <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete={register ? 'new-password' : 'current-password'} hint={register ? 'At least 12 characters.' : undefined} onSubmitEditing={submit} />
        <ErrorMessage message={task.error || nest.error} /><Button title={task.pending ? 'Please wait...' : register ? 'Create account' : 'Sign in'} disabled={task.pending} onPress={submit} icon="arrow-forward-outline" />
        <Button title={register ? 'Already have an account? Sign in' : 'New to NestWise? Create an account'} variant="ghost" onPress={() => { setRegister(!register); task.setError(null); nest.clearError(); }} />
        <Button title="Forgot your password?" variant="ghost" onPress={() => router.push("/account")} /><Label muted style={{ fontSize: 12, textAlign: 'center' }}>Your family's information stays in your household. No public profiles.</Label>
      </Card>
    </Row>
  </ScrollView></KeyboardAvoidingView>;
}
