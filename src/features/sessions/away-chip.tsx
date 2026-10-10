import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { IconButton } from '@/components/ui/icon-button';
import { Spacing } from '@/constants/theme';
import { shadows, useShape, useTheme, useType } from '@/hooks/use-theme';

import type { Away } from './session-manager';

/** What arrived, as the chip says it: "142 new lines", or "Read what’s new" for tmux. */
export function awayLabel(away: Away): string {
  if (away.lines === null) return 'Read what’s new';
  const count = `${away.lines.toLocaleString()}${away.more ? '+' : ''}`;
  return `${count} new ${away.lines === 1 && !away.more ? 'line' : 'lines'}`;
}

/**
 * Says what a session wrote while the person was away, at the top of the terminal. A tap
 * goes to it: back up the scrollback to where they left off, or into reading mode when a
 * full-screen program (tmux, zellij) drew it.
 */
export function AwayChip({
  away,
  onOpen,
  onDismiss,
}: {
  away: Away;
  onOpen(): void;
  onDismiss(): void;
}) {
  const theme = useTheme();
  const shape = useShape();
  const { sans } = useType();
  const label = awayLabel(away);

  return (
    <View pointerEvents="box-none" style={styles.wrap}>
      <View
        style={[
          styles.chip,
          {
            backgroundColor: theme.backgroundRaised,
            borderColor: theme.border,
            borderRadius: shape.radius.pill,
            borderWidth: shape.hairline,
            boxShadow: shadows(shape.shadowFloat),
          },
        ]}>
        <Pressable
          role="button"
          aria-label={`${away.lines === null ? label : `Jump to ${label}`} since you left`}
          onPress={onOpen}
          hitSlop={4}
          style={({ pressed }) => [
            styles.open,
            {
              borderRadius: shape.radius.pill,
              backgroundColor: pressed ? theme.backgroundSelected : 'transparent',
            },
          ]}>
          <Icon name={away.lines === null ? 'read' : 'up'} size={16} color="text" />
          <Text style={[styles.label, sans(600), { color: theme.text }]} numberOfLines={1}>
            {label}
          </Text>
        </Pressable>
        <IconButton icon="close" label="Dismiss" size={16} onPress={onDismiss} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: Spacing.two,
    left: Spacing.three,
    right: Spacing.three,
    alignItems: 'center',
  },
  chip: { flexDirection: 'row', alignItems: 'center', maxWidth: '100%', paddingRight: 2 },
  open: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    gap: Spacing.two,
    minHeight: 40,
    paddingLeft: Spacing.three,
    paddingRight: Spacing.one,
  },
  label: { fontSize: 14, flexShrink: 1 },
});
