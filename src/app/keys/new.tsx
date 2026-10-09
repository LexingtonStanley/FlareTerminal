import { useRouter } from 'expo-router';

import { KeyImportForm } from '@/features/ssh/key-import-form';

export default function ImportKeyScreen() {
  const router = useRouter();

  return (
    <KeyImportForm
      onImported={(key) => router.replace({ pathname: '/keys/[id]', params: { id: key.id } })}
    />
  );
}
