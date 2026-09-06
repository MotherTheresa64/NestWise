import { useColorScheme } from 'react-native';
import { useNest } from './lib/store';

const light = {
  bg: '#F7F6F1', surface: '#FFFFFF', soft: '#EFEEE7', text: '#283B34', muted: '#748078',
  border: '#E2E6DD', primary: '#466650', primaryText: '#FFFFFF', sage: '#E4EDDF',
  lavender: '#EDE8F4', peach: '#FAEDDF', danger: '#A13F3F', dangerBg: '#FBECEC',
};
const dark: typeof light = {
  bg: '#18231F', surface: '#223029', soft: '#2B3B32', text: '#EDF2E9', muted: '#A9B7AB',
  border: '#3A4B40', primary: '#B8D2AB', primaryText: '#1C2D20', sage: '#344A37',
  lavender: '#3D354C', peach: '#4B3D30', danger: '#F3ABAB', dangerBg: '#482E2E',
};
export function usePalette() {
  const { theme } = useNest();
  const system = useColorScheme();
  return theme === 'dark' || (theme === 'system' && system === 'dark') ? dark : light;
}
export const categoryLabels: Record<string, string> = {
  sleep: 'Sleep', nursing: 'Nursing', bottle: 'Bottle', pumping: 'Pumping', food: 'Food',
  water: 'Water', diaper: 'Diaper', potty: 'Potty', medicine: 'Medicine', temperature: 'Temperature',
  symptom: 'Symptom', growth: 'Growth', teeth: 'Teeth', bath: 'Bath', routine: 'Routine',
  milestone: 'Milestone', custom: 'Other',
};
export const categoryIcons: Record<string, 'moon-outline' | 'water-outline' | 'restaurant-outline' | 'heart-outline' | 'leaf-outline' | 'medical-outline' | 'resize-outline' | 'sparkles-outline'> = {
  sleep: 'moon-outline', nursing: 'heart-outline', bottle: 'water-outline', pumping: 'water-outline',
  food: 'restaurant-outline', water: 'water-outline', diaper: 'leaf-outline', potty: 'leaf-outline',
  medicine: 'medical-outline', temperature: 'medical-outline', symptom: 'medical-outline', growth: 'resize-outline',
};
export function localDateTime(value: string | Date = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16).replace('T', ' ');
}
export function parseDateTime(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/.test(value.trim())) {
    throw new Error('Use YYYY-MM-DD HH:mm for date and time.');
  }
  const result = new Date(value.trim().replace(' ', 'T'));
  if (Number.isNaN(result.getTime())) throw new Error('Enter a valid date and time.');
  return result.toISOString();
}
export function formatTime(value: string, timezone?: string) {
  return new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone: timezone });
}
export function formatDate(value: string, timezone?: string) {
  return new Date(value).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric', timeZone: timezone });
}
export function elapsed(start: string, end: string | Date = new Date()) {
  const minutes = Math.max(0, Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 60000));
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;
}
