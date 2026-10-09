import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';

import { ThemedText } from '@/components/themed-text';
import { Screen } from '@/components/ui/screen';
import { ConnectionForm } from '@/features/connections/connection-form';
import { toInput } from '@/features/connections/connections';
import { useConnections } from '@/features/connections/connections-provider';
import { useShortcuts } from '@/features/shortcuts/shortcuts-provider';
import { knownHosts } from '@/features/ssh/known-hosts';

export default function EditConnectionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { connections, save, remove, getPassword } = useConnections();
  const { removeForConnection } = useShortcuts();
  const router = useRouter();
  const [, setForgotten] = useState(0);
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

  const trusted =
    connection.kind === 'ssh' ? knownHosts.get(connection.host, connection.port) : null;

  return (
    <ConnectionForm
      initial={toInput(connection, getPassword(connection.id))}
      submitLabel="Save"
      onSubmit={(input) => {
        save(input, connection.id);
        leave();
      }}
      onDelete={() => {
        remove(connection.id);
        removeForConnection(connection.id);
        leave();
      }}
      hostKey={
        trusted && connection.kind === 'ssh'
          ? {
              fingerprint: trusted.fingerprint,
              onForget: () => {
                knownHosts.forget(connection.host, connection.port);
                setForgotten((count) => count + 1);
              },
            }
          : null
      }
    />
  );
}
