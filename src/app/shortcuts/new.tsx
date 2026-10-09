import { useRouter } from 'expo-router';

import { useConnections } from '@/features/connections/connections-provider';
import { ShortcutForm } from '@/features/shortcuts/shortcut-form';
import { groupOptions, newShortcutInput } from '@/features/shortcuts/shortcuts';
import { useShortcuts } from '@/features/shortcuts/shortcuts-provider';

export default function NewShortcutScreen() {
  const { connections } = useConnections();
  const { shortcuts, save } = useShortcuts();
  const router = useRouter();
  // Opened from a deep link there is nothing to go back to.
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));

  return (
    <ShortcutForm
      connections={connections}
      groups={groupOptions(shortcuts)}
      initial={newShortcutInput(shortcuts)}
      onSubmit={(input) => {
        save(input);
        leave();
      }}
    />
  );
}
