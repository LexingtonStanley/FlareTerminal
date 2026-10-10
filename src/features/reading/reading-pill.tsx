import { useEffect, useEffectEvent } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Spacing } from '@/constants/theme';
import { shadows, useShape, useTheme, useType } from '@/hooks/use-theme';

/** How long the pill stays after a swipe back, unless another swipe brings it again. */
const PILL_MS = 6000;

/**
 * Offered at the top of the terminal while the person scrolls back through an agent's
 * output: the same history as text to read, select and copy.
 */
export function ReadingPill({ onOpen, onDismiss }: { onOpen(): void; onDismiss(): void }) {
  const theme = useTheme();
  const shape = useShape();
  const { sans } = useType();
  const dismiss = useEffectEvent(onDismiss);

  useEffect(() => {
    const timer = setTimeout(dismiss, PILL_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View pointerEvents="box-none" style={styles.wrap}>
      <Pressable
        role="button"
        aria-label="Open reading mode"
        onPress={onOpen}
        hitSlop={4}
        style={({ pressed }) => [
          styles.pill,
          {
            backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundRaised,
            borderColor: theme.border,
            borderRadius: shape.radius.pill,
            borderWidth: shape.hairline,
            boxShadow: shadows(shape.shadowFloat),
          },
        ]}>
        <Icon name="read" size={16} color="text" />
        <Text style={[styles.label, sans(600), { color: theme.text }]}>Reading mode</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', top: Spacing.two, left: 0, right: 0, alignItems: 'center' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 40,
    paddingHorizontal: Spacing.three,
  },
  label: { fontSize: 14 },
});
