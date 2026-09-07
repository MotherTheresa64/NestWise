import { Platform, Share } from 'react-native';
export async function shareBackup(data: unknown, filename = 'nestwise-local-care-backup.json') {
  const text = JSON.stringify(data, null, 2);
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } else await Share.share({ title: 'NestWise local care backup', message: text });
}
