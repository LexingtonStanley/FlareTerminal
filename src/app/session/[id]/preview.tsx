import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Spacing } from '@/constants/theme';
import { useConnections } from '@/features/connections/connections-provider';
import { findLocalPorts, parsePort } from '@/features/preview/local-urls';
import { PortPicker } from '@/features/preview/port-picker';
import { PreviewBrowser } from '@/features/preview/preview-browser';
import { lastPreviewPort, rememberPreviewPort } from '@/features/preview/preview-ports';
import { usePortForward } from '@/features/preview/use-port-forward';
import { SessionGate } from '@/features/sessions/session-gate';
import type { SessionSnapshot } from '@/features/sessions/session-manager';
import { useSessionManager } from '@/features/sessions/sessions-provider';
import { useTheme } from '@/hooks/use-theme';

/** A session's dev server, forwarded over its SSH connection and shown in a browser. */
export default function PreviewScreen() {
  const { id, port, path } = useLocalSearchParams<{
    id: string;
    port?: string | string[];
    path?: string | string[];
  }>();

  return (
    <SessionGate id={id}>
      {(session) => (
        <Preview
          session={session}
          // A link that repeats a parameter gives a list: ignore it.
          linkedPort={typeof port === 'string' ? parsePort(port) : null}
          // Only a path: the preview's own origin goes in front of it.
          path={typeof path === 'string' && path.startsWith('/') ? path : '/'}
        />
      )}
    </SessionGate>
  );
}

function Preview({
  session,
  linkedPort,
  path,
}: {
  session: SessionSnapshot;
  linkedPort: number | null;
  path: string;
}) {
  const { connections } = useConnections();
  const connection = connections.find(({ id }) => id === session.connectionId);
  const manager = useSessionManager();
  const [port, setPort] = useState(() => linkedPort ?? lastPreviewPort(session.connectionId));
  const [startPath, setStartPath] = useState(path);
  const [found, setFound] = useState<number[] | null>(() =>
    port === null ? findLocalPorts(manager.recentText(session.id)) : null
  );
  // Remounting the forward is how "Try again" starts over.
  const [attempt, setAttempt] = useState(0);

  if (Platform.OS === 'web' || connection?.kind !== 'ssh') {
    return (
      <Screen centered>
        <Stack.Screen options={{ title: 'Preview' }} />
        <ThemedText themeColor="textSecondary">
          {Platform.OS === 'web'
            ? 'Previews need the Android or iOS app.'
            : 'Previews work over SSH connections.'}
        </ThemedText>
      </Screen>
    );
  }

  if (found || port === null) {
    return (
      <>
        <Stack.Screen options={{ title: 'Preview' }} />
        <PortPicker
          host={connection.name}
          found={found ?? []}
          initial={port}
          onPick={(picked) => {
            rememberPreviewPort(connection.id, picked);
            setPort(picked);
            setStartPath('/');
            setFound(null);
            setAttempt((count) => count + 1);
          }}
        />
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: `Preview · ${connection.name}` }} />
      <Forwarded
        key={`${port}:${attempt}`}
        sessionId={session.id}
        host={connection.name}
        port={port}
        path={startPath}
        onRetry={() => setAttempt((count) => count + 1)}
        onChangePort={() => setFound(findLocalPorts(manager.recentText(session.id)))}
      />
    </>
  );
}

function Forwarded({
  sessionId,
  host,
  port,
  path,
  onRetry,
  onChangePort,
}: {
  sessionId: string;
  host: string;
  port: number;
  path: string;
  onRetry(): void;
  onChangePort(): void;
}) {
  const theme = useTheme();
  const [forward, clearError] = usePortForward(sessionId, port, host);

  if (forward.state === 'starting') {
    return (
      <Screen centered>
        <ActivityIndicator color={theme.textSecondary} />
        <ThemedText themeColor="textSecondary" role="status">
          Forwarding port {port} from {host}…
        </ThemedText>
      </Screen>
    );
  }

  if (forward.state === 'failed') {
    return (
      <Screen centered style={styles.failed}>
        <ThemedText type="headline" role="alert">
          Can’t open localhost:{port}
        </ThemedText>
        <ThemedText themeColor="textSecondary">{forward.message}</ThemedText>
        <View style={styles.actions}>
          <Button title="Try again" onPress={onRetry} />
          <Button title="Change port" variant="secondary" onPress={onChangePort} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={['left', 'right', 'bottom']} style={styles.browser}>
      <PreviewBrowser
        // Another origin if the phone's port changed: start the page again there.
        key={forward.localPort}
        localPort={forward.localPort}
        port={port}
        path={path}
        error={forward.error}
        onClearError={clearError}
        onChangePort={onChangePort}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  browser: { padding: 0, gap: 0, maxWidth: '100%' },
  failed: { gap: Spacing.three - 4 },
  actions: { gap: Spacing.two + 2, marginTop: Spacing.two, alignSelf: 'stretch' },
});
