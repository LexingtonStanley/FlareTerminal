import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/ui/icon';
import { IconButton } from '@/components/ui/icon-button';
import { Spacing } from '@/constants/theme';
import { shadows, useShape, useTheme } from '@/hooks/use-theme';

import { HARNESSES } from './agent-command';
import type { Shortcut } from './shortcuts';

type ShortcutTileProps = {
  shortcut: Shortcut;
  /** The connection's name, or undefined when it was deleted. */
  connectionName: string | undefined;
  onRun(): void;
  onEdit(): void;
};

/** A shortcut on Home: tap to run it. An agent's shows which agent and its folder. */
export function ShortcutTile({ shortcut, connectionName, onRun, onEdit }: ShortcutTileProps) {
  const theme = useTheme();
  const shape = useShape();
  const connection = connectionName ?? 'Missing connection';
  const { agent } = shortcut;

  return (
    <View
      style={[
        styles.tile,
        {
          backgroundColor: theme.backgroundElement,
          borderColor: theme.border,
          borderRadius: shape.radius.large,
          borderWidth: shape.hairline,
          boxShadow: shadows(shape.shadowCard),
        },
      ]}>
      <Pressable
        role="button"
        aria-label={`Run ${shortcut.name}`}
        onPress={onRun}
        style={({ pressed }) => [
          styles.main,
          pressed && { backgroundColor: theme.backgroundSelected },
        ]}>
        <View
          style={[
            styles.badge,
            { backgroundColor: theme.primaryMuted, borderRadius: shape.radius.pill },
          ]}>
          <Icon name="run" size={16} color="primaryText" />
        </View>
        <View style={styles.text}>
          <ThemedText type="headline" numberOfLines={1}>
            {shortcut.name}
          </ThemedText>
          <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1}>
            {agent ? `${HARNESSES[agent.harness].label} · ${connection}` : connection}
          </ThemedText>
        </View>
        <ThemedText type="code" themeColor="textSecondary" numberOfLines={1} style={styles.command}>
          {(agent && shortcut.directory) || shortcut.command}
        </ThemedText>
      </Pressable>
      <View style={styles.edit}>
        <IconButton
          icon="edit"
          size={16}
          label={`Edit shortcut ${shortcut.name}`}
          onPress={onEdit}
        />
      </View>
    </View>
  );
}

/** The last tile in the grid: makes a new shortcut. */
export function NewShortcutTile({ onPress, hint }: { onPress(): void; hint: string }) {
  const theme = useTheme();
  const shape = useShape();

  return (
    <Pressable
      role="button"
      aria-label="New shortcut"
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        styles.add,
        {
          borderRadius: shape.radius.large,
          borderColor: theme.border,
          backgroundColor: pressed ? theme.backgroundSelected : 'transparent',
        },
      ]}>
      <View
        style={[styles.addBadge, { borderColor: theme.border, borderRadius: shape.radius.pill }]}>
        <Icon name="add" size={18} color="text" />
      </View>
      <ThemedText type="smallBold">New shortcut</ThemedText>
      <ThemedText type="caption" themeColor="textSecondary" style={styles.center}>
        {hint}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    flexBasis: '46%',
    flexGrow: 1,
    minHeight: 132,
    overflow: 'hidden',
  },
  main: { flex: 1, gap: Spacing.two + 2, padding: Spacing.three - 2 },
  badge: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { gap: Spacing.half },
  command: { fontSize: 12, marginTop: 'auto' },
  edit: { position: 'absolute', top: Spacing.one, right: Spacing.one },
  add: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one + 2,
    padding: Spacing.three,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  addBadge: {
    width: 36,
    height: 36,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.half,
  },
  center: { textAlign: 'center' },
});
