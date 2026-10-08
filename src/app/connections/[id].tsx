import { Link, useLocalSearchParams, useRouter } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { Screen } from '@/components/ui/screen';
import { ConnectionForm } from '@/features/connections/connection-form';
import { useConnections } from '@/features/connections/connections-provider';

export default function EditConnectionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { connections, save, remove, getPassword } = useConnections();
  const router = useRouter();
  // Opened from a deep link there is nothing to go back to.
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const connection = connections.find((candidate) => candidate.id === id);

  if (!connection) {
    return (
      <Screen centered>
        <ThemedText type="subtitle" role="heading">
          Connection not found
        </ThemedText>
        <Link href="/">
          <ThemedText type="linkPrimary">Back to connections</ThemedText>
        </Link>
      </Screen>
    );
  }

  return (
    <ConnectionForm
      initial={{ ...connection, password: getPassword(connection.id) ?? '' }}
      submitLabel="Save"
      onSubmit={(input) => {
        save(input, connection.id);
        leave();
      }}
      onDelete={() => {
        remove(connection.id);
        leave();
      }}
    />
  );
}
