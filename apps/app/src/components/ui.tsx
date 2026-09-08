import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, ActivityIndicator, KeyboardAvoidingView, Platform, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions, type TextInputProps, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usePalette } from '../theme';

export function useTask() {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const running = useRef(false);
  const run = async (action: () => Promise<unknown>) => {
    if (running.current) return;
    running.current = true;
    setPending(true); setError(null);
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.'); }
    finally { running.current = false; setPending(false); }
  };
  return { error, pending, run, setError };
}
export function Label({ children, muted = false, style }: { children: ReactNode; muted?: boolean; style?: import('react-native').StyleProp<import('react-native').TextStyle> }) {
  const c = usePalette();
  return <Text style={[{ color: muted ? c.muted : c.text, fontSize: 15, lineHeight: 23 }, style]}>{children}</Text>;
}
export function Heading({ children, small = false }: { children: ReactNode; small?: boolean }) {
  const c = usePalette();
  return <Text accessibilityRole="header" style={{ color: c.text, fontSize: small ? 19 : 32, fontWeight: '600', letterSpacing: small ? -0.4 : -1 }}>{children}</Text>;
}
export function Button({ title, onPress, variant = 'primary', disabled, icon, compact = false }: {
  title: string; onPress: () => void; variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; disabled?: boolean;
  icon?: React.ComponentProps<typeof Ionicons>['name']; compact?: boolean;
}) {
  const c = usePalette();
  const fg = variant === 'primary' ? c.primaryText : variant === 'danger' ? c.danger : c.text;
  return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: compact ? 13 : 18,
      minHeight: 44, paddingVertical: 10, borderRadius: 12, backgroundColor: variant === 'primary' ? c.primary : variant === 'secondary' ? c.soft : variant === 'danger' ? c.dangerBg : 'transparent',
      opacity: disabled ? 0.45 : pressed ? 0.7 : 1 })}>
    {icon && <Ionicons name={icon} size={18} color={fg} />}<Text style={{ color: fg, fontSize: 14, fontWeight: '600' }}>{title}</Text>
  </Pressable>;
}
export function Card({ children, style, tone }: { children: ReactNode; style?: ViewStyle; tone?: 'sage' | 'lavender' | 'peach' }) {
  const c = usePalette();
  return <View style={[{ backgroundColor: tone ? c[tone] : c.surface, borderWidth: 0, borderColor: c.border, borderRadius: 20, padding: 22, gap: 16 }, style]}>{children}</View>;
}
export function Row({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 }, style]}>{children}</View>;
}
export function Field({ label, hint, ...props }: TextInputProps & { label: string; hint?: string }) {
  const c = usePalette();
  return <View style={{ gap: 7, flexGrow: 1, minWidth:0, maxWidth:'100%' }}>
    <Label style={{ fontWeight: '600', fontSize: 13 }}>{label}</Label>
    <TextInput accessibilityLabel={label} placeholderTextColor={c.muted} {...props}
      style={[{ backgroundColor: c.surface, color: c.text, borderColor: c.border, borderWidth: 1, borderRadius: 11, padding: 13, minHeight: 46, fontSize: 15, textAlignVertical: props.multiline ? 'top' : 'center' }, props.style]} />
    {hint && <Label muted style={{ fontSize: 12 }}>{hint}</Label>}
  </View>;
}
export function Choice<T extends string>({ label, options, value, onChange, multiple = false }: {
  label?: string; options: readonly { value: T; label: string }[]; value: T | T[]; onChange: (value: T) => void; multiple?: boolean;
}) {
  const c = usePalette();
  return <View style={{ gap: 9, minWidth:0, width:'100%' }}>{label && <Label style={{ fontWeight: '600', fontSize: 13 }}>{label}</Label>}
    <Row>{options.map(option => { const selected = Array.isArray(value) ? value.includes(option.value) : value === option.value;
      return <Pressable key={option.value} accessibilityRole={multiple ? 'checkbox' : 'radio'} aria-checked={selected} accessibilityState={{ checked: selected }} onPress={() => onChange(option.value)}
        style={{ minHeight: 44, borderRadius: 10, paddingHorizontal: 13, paddingVertical: 11, borderWidth: 1, borderColor: selected ? c.primary : c.border, backgroundColor: selected ? c.sage : c.surface }}>
        <Text style={{ color: c.text, fontSize: 15, fontWeight: selected ? '600' : '400' }}>{option.label}</Text>
      </Pressable>;
    })}</Row>
  </View>;
}
export function ErrorMessage({ message }: { message?: string | null }) {
  const c = usePalette();
  return message ? <View accessibilityRole="alert" style={{ backgroundColor: c.dangerBg, borderRadius: 12, padding: 14 }}><Text style={{ color: c.danger, fontSize: 15, lineHeight: 23 }}>{message}</Text></View> : null;
}
export function Segmented({label,value,options,onChange}:{label:string;value:string;options:{value:string;label:string}[];onChange:(value:string)=>void}) {
  const c=usePalette();
  return <View accessibilityLabel={label} style={{flexDirection:'row',padding:5,gap:3,backgroundColor:c.soft,borderRadius:17}}>{options.map(option=><Pressable key={option.value} accessibilityRole="radio" accessibilityLabel={option.label} accessibilityState={{checked:value===option.value}} aria-checked={value===option.value} onPress={()=>onChange(option.value)} style={({pressed})=>({flex:1,minHeight:48,alignItems:'center',justifyContent:'center',borderRadius:12,backgroundColor:value===option.value?c.primary:'transparent',opacity:pressed?0.7:1})}><Text style={{fontSize:15,fontWeight:'600',color:value===option.value?c.primaryText:c.text}}>{option.label}</Text></Pressable>)}</View>;
}
export function Notice({ children }: { children: ReactNode }) {
  return <Card tone="sage" style={{ padding: 15 }}><Label>{children}</Label></Card>;
}
export function Empty({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  const c = usePalette();
  return <Card style={{ alignItems: 'center', paddingVertical: 36 }}><Ionicons name="leaf-outline" size={32} color={c.primary} /><Heading small>{title}</Heading><Label muted style={{ textAlign: 'center', maxWidth: 420 }}>{description}</Label>{action}</Card>;
}
export function Page({ title, subtitle, action, children }: { title: string; subtitle: string; action?: ReactNode; children: ReactNode }) {
  const mobile=useWindowDimensions().width<900;
  return <ScrollView contentContainerStyle={{ padding: mobile?18:28, paddingBottom: 48, gap: 24, width: '100%', maxWidth: 1600, alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
    <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}><View style={{ gap: 8, flex: 1, minWidth: 200 }}><Heading>{title}</Heading><Label muted>{subtitle}</Label></View>{action}</Row>{children}
  </ScrollView>;
}
export function Dialog({ visible, title, children, onClose, footer }: { visible: boolean; title: string; children: ReactNode; onClose: () => void; footer?: ReactNode }) {
  const c = usePalette();
  const insets=useSafeAreaInsets();const mobile=useWindowDimensions().width<900;
  const [reducedMotion, setReducedMotion] = useState(true);
  useEffect(() => { let active = true; void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (active) setReducedMotion(value); }); const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion); return () => { active = false; listener.remove(); }; }, []);
  return <Modal visible={visible} transparent animationType={reducedMotion ? 'none' : 'fade'} onRequestClose={onClose}>
    <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':undefined} style={{ flex: 1, backgroundColor: '#00000066', justifyContent: mobile?'flex-end':'center', padding: mobile?8:16, paddingTop: Math.max(16,insets.top), paddingBottom:Math.max(8,insets.bottom) }}>
      <View role="dialog" accessibilityLabel={title} accessibilityViewIsModal style={{ maxWidth: 740, width: '100%', maxHeight: mobile?'96%':'92%', alignSelf: 'center', backgroundColor: c.bg, borderRadius: 24, overflow: 'hidden' }}>
        <Row style={{ padding: 20, justifyContent: 'space-between', borderBottomWidth: 1, borderColor: c.border }}><Heading small>{title}</Heading><Button title="Close" variant="ghost" onPress={onClose} /></Row>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 22, gap: 18 }}>{children}</ScrollView>
        {footer && <View style={{padding:16,borderTopWidth:1,borderColor:c.border}}>{footer}</View>}
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}
export function Confirm({ title, description, onConfirm, onClose, confirmLabel = 'Delete' }: { title: string; description: string; onConfirm: () => Promise<unknown>; onClose: () => void; confirmLabel?: string }) {
  const task = useTask();
  return <Dialog visible title={title} onClose={onClose}><Label>{description}</Label><ErrorMessage message={task.error} /><Row><Button title="Cancel" variant="secondary" onPress={onClose} disabled={task.pending} /><Button title={task.pending ? 'Working...' : confirmLabel} variant="danger" disabled={task.pending} onPress={() => void task.run(async () => { await onConfirm(); onClose(); })} /></Row></Dialog>;
}
export function Loading() { const c = usePalette(); return <View style={styles.center}><ActivityIndicator size="large" color={c.primary} /><Label muted>Getting your nest ready...</Label></View>; }
const styles = StyleSheet.create({ center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18, padding: 24 } });
