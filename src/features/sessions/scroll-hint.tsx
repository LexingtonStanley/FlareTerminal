import { useEffect, useEffectEvent } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Spacing } from '@/constants/theme';
import { shadows, useShape, useTheme } from '@/hooks/use-theme';

/** How long the hint stays up, unless it's dismissed sooner. */
const HINT_MS = 8000;

/**
 * Says why a swipe didn't scroll: a full-screen program that doesn't read the mouse keeps
 * its history to itself (tmux with mouse mode off, most often). Offers reading mode, which
 * reads it anyway. Goes away by itself.
 */
export function ScrollHint({ onRead, onDismiss }: { onRead(): void; onDismiss(): void }) {
  const theme = useTheme();
  const shape = useShape();
  const dismiss = useEffectEvent(onDismiss);

  useEffect(() => {
    const timer = setTimeout(dismiss, HINT_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View pointerEvents="box-none" style={styles.wrap}>
      <View
        role="alert"
        aria-label="Can’t scroll this program"
        style={[
          styles.hint,
          {
            backgroundColor: theme.backgroundRaised,
            borderColor: theme.border,
            borderRadius: shape.radius.large,
            borderWidth: shape.hairline,
            boxShadow: shadows(shape.shadowFloat),
          },
        ]}>
        <View style={styles.heading}>
          <ThemedText type="smallBold" style={styles.title}>
            This program keeps its history to itself
          </ThemedText>
          <IconButton icon="close" label="Dismiss" size={16} onPress={onDismiss} />
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          Reading mode shows what it wrote. In tmux, mouse mode lets a swipe scroll too; agent
          shortcuts turn it on for you.
        </ThemedText>
        <ThemedText type="code" selectable>
          tmux set -g mouse on
        </ThemedText>
        <Button
          title="Open reading mode"
          icon="read"
          size="small"
          variant="secondary"
          onPress={onRead}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', top: Spacing.three, left: Spacing.three, right: Spacing.three },
  hint: { gap: Spacing.two, padding: Spacing.three, paddingTop: Spacing.two },
  heading: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  title: { flex: 1 },
});
