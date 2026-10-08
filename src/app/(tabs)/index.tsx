import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Spacing } from '@/constants/theme';
import { TTYD_COMMAND } from '@/features/connections/connections';
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
          <ThemedText type="smallBold">Connect to a computer running ttyd</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            On the computer, install ttyd and tmux, then run:
          </ThemedText>
          <ThemedText
            type="code"
            selectable
            style={[styles.command, { borderColor: theme.border }]}>
            {TTYD_COMMAND}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            -W lets you type, -c sets the username and password, and tmux keeps your shells and
            agents running while the phone is away. Reach it over Tailscale or HTTPS rather than the
            open internet.
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
                {connection.username ? `${connection.username} @ ` : ''}
                {connection.url}
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
