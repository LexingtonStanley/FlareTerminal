import { useEffect, useEffectEvent } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { shadows, useShape, useTheme } from '@/hooks/use-theme';

/** How long the hint stays up, unless it's tapped away sooner. */
const HINT_MS = 8000;

/**
 * Says why a swipe didn't scroll: a full-screen program that doesn't read the mouse keeps
 * its history to itself (tmux with mouse mode off, most often). Goes away by itself.
 */
export function ScrollHint({ onDismiss }: { onDismiss(): void }) {
  const theme = useTheme();
  const shape = useShape();
  const dismiss = useEffectEvent(onDismiss);

  useEffect(() => {
    const timer = setTimeout(dismiss, HINT_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View pointerEvents="box-none" style={styles.wrap}>
      <Pressable
        role="alert"
        aria-label="Can’t scroll this program. Tap to dismiss."
        onPress={onDismiss}
        style={({ pressed }) => [
          styles.hint,
          {
            backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundRaised,
            borderColor: theme.border,
            borderRadius: shape.radius.large,
            borderWidth: shape.hairline,
            boxShadow: shadows(shape.shadowFloat),
          },
        ]}>
        <ThemedText type="smallBold">This program keeps its history to itself</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          In tmux, turn on mouse mode to scroll with a finger. Agent shortcuts turn it on for you.
        </ThemedText>
        <ThemedText type="code" selectable>
          tmux set -g mouse on
        </ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', top: Spacing.three, left: Spacing.three, right: Spacing.three },
  hint: { gap: Spacing.one, padding: Spacing.three },
});
