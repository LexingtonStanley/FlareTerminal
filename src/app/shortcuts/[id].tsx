import { Link, useLocalSearchParams, useRouter } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { Screen } from '@/components/ui/screen';
import { useConnections } from '@/features/connections/connections-provider';
import { ShortcutForm } from '@/features/shortcuts/shortcut-form';
import { groupOptions } from '@/features/shortcuts/shortcuts';
import { useShortcuts } from '@/features/shortcuts/shortcuts-provider';

export default function EditShortcutScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { connections } = useConnections();
  const { shortcuts, save, remove } = useShortcuts();
  const router = useRouter();
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const shortcut = shortcuts.find((candidate) => candidate.id === id);

  if (!shortcut) {
    return (
      <Screen centered>
        <ThemedText type="subtitle" role="heading">
          Shortcut not found
        </ThemedText>
        <Link href="/">
          <ThemedText type="linkPrimary">Back home</ThemedText>
        </Link>
      </Screen>
    );
  }

  return (
    <ShortcutForm
      connections={connections}
      groups={groupOptions(shortcuts)}
      initial={shortcut}
      onSubmit={(input) => {
        save(input, shortcut.id);
        leave();
      }}
      onDelete={() => {
        remove(shortcut.id);
        leave();
      }}
    />
  );
}
