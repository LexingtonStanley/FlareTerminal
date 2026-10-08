import { useRouter } from 'expo-router';

import { ConnectionForm } from '@/features/connections/connection-form';
import { useConnections } from '@/features/connections/connections-provider';

export default function NewConnectionScreen() {
  const { save } = useConnections();
  const router = useRouter();
  // Opened from a deep link there is nothing to go back to.
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));

  return (
    <ConnectionForm
      submitLabel="Save"
      onSubmit={(input) => {
        save(input);
        leave();
      }}
    />
  );
}
