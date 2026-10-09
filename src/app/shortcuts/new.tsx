import { useRouter } from 'expo-router';

import { useConnections } from '@/features/connections/connections-provider';
import { ShortcutForm } from '@/features/shortcuts/shortcut-form';
import { useShortcuts } from '@/features/shortcuts/shortcuts-provider';

export default function NewShortcutScreen() {
  const { connections } = useConnections();
  const { save } = useShortcuts();
  const router = useRouter();
  // Opened from a deep link there is nothing to go back to.
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));

  return (
    <ShortcutForm
      connections={connections}
      onSubmit={(input) => {
        save(input);
        leave();
      }}
    />
  );
}
