import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Spacing } from '@/constants/theme';
import { connectionLabel } from '@/features/connections/connections';
import { useConnections } from '@/features/connections/connections-provider';
import { useTheme } from '@/hooks/use-theme';

export default function ConnectionsScreen() {
  const { connections } = useConnections();
  const router = useRouter();
  const theme = useTheme();

  return (
    <Screen scroll>
      <ThemedText type="subtitle" role="heading">
        Connections
      </ThemedText>

      {connections.length === 0 ? (
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="smallBold">Connect to your computer over SSH</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Nothing to install on it: if you can run this from a laptop, Flare can connect too.
          </ThemedText>
          <ThemedText
            type="code"
            selectable
            style={[styles.command, { borderColor: theme.border }]}>
            ssh lexde@lexbox
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            With Tailscale on the phone and the computer, use the computer&apos;s Tailscale name.
            Run agents inside tmux or zellij so they keep going while the phone is away.
          </ThemedText>
        </ThemedView>
      ) : (
        connections.map((connection) => (
          <ThemedView key={connection.id} type="backgroundElement" style={styles.row}>
            <Pressable
              role="button"
              aria-label={`Open ${connection.name}`}
              onPress={() =>
                router.push({ pathname: '/terminal/[id]', params: { id: connection.id } })
              }
              style={({ pressed }) => [styles.open, pressed && styles.pressed]}>
              <ThemedText type="smallBold">{connection.name}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                {connection.kind === 'ttyd'
                  ? `ttyd · ${connectionLabel(connection)}`
                  : connectionLabel(connection)}
              </ThemedText>
            </Pressable>
            <Pressable
              role="button"
              aria-label={`Edit ${connection.name}`}
              onPress={() =>
                router.push({ pathname: '/connections/[id]', params: { id: connection.id } })
              }
              style={({ pressed }) => [styles.edit, pressed && styles.pressed]}>
              <ThemedText type="small" themeColor="primary">
                Edit
              </ThemedText>
            </Pressable>
          </ThemedView>
        ))
      )}

      <View style={styles.actions}>
        <Button title="New connection" onPress={() => router.push('/connections/new')} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.two, padding: Spacing.three, borderRadius: Spacing.three },
  command: {
    padding: Spacing.two,
    borderWidth: 1,
    borderRadius: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Spacing.three,
  },
  open: { flex: 1, gap: Spacing.half, padding: Spacing.three },
  edit: { padding: Spacing.three },
  pressed: { opacity: 0.7 },
  actions: { marginTop: Spacing.two },
});
