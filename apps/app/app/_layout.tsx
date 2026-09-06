import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NestProvider } from '../src/lib/store';
import { Shell } from '../src/components/Shell';

export default function RootLayout() {
  return <SafeAreaProvider><NestProvider><Shell /></NestProvider></SafeAreaProvider>;
}
