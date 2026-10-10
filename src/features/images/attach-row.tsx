import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon, type IconName } from '@/components/ui/icon';
import { Spacing } from '@/constants/theme';
import { useShape, useTheme, useType } from '@/hooks/use-theme';

import type { ImageSource } from './image-source';

export type AttachState =
  | { kind: 'menu' }
  | { kind: 'sending' }
  /** `message` says what went wrong, whole. */
  | { kind: 'failed'; message: string };

type AttachRowProps = {
  state: AttachState;
  onPick(source: ImageSource): void;
  /** Stops sending. */
  onCancel(): void;
  /** Closes the menu or the error. */
  onClose(): void;
};

const SOURCES: { source: ImageSource; icon: IconName; title: string; label: string }[] = [
  { source: 'clipboard', icon: 'paste', title: 'Paste', label: 'Paste an image' },
  { source: 'library', icon: 'photos', title: 'Photos', label: 'Choose a photo' },
  { source: 'camera', icon: 'camera', title: 'Camera', label: 'Take a photo' },
];

/**
 * Sending an image, in the prompt strip's place and at its height (a change of height
 * resizes the terminal): where it comes from, then that it's on its way, or why it didn't
 * get there.
 */
export function AttachRow({ state, onPick, onCancel, onClose }: AttachRowProps) {
  const theme = useTheme();
  const shape = useShape();
  const { sans } = useType();

  function chip(key: string, label: string, title: string, onPress: () => void, icon?: IconName) {
    return (
      <Pressable
        key={key}
        role="button"
        aria-label={label}
        onPress={onPress}
        hitSlop={{ top: 4, bottom: 4 }}
        style={({ pressed }) => [
          styles.chip,
          {
            borderRadius: shape.radius.pill,
            borderWidth: shape.hairline,
            borderColor: theme.border,
            backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement,
          },
        ]}>
        {icon ? <Icon name={icon} size={16} /> : null}
        <Text numberOfLines={1} style={[styles.label, sans(500), { color: theme.text }]}>
          {title}
        </Text>
      </Pressable>
    );
  }

  return (
    <View role="group" aria-label="Attach an image" style={styles.strip}>
      <View style={styles.content}>
        {state.kind === 'menu' ? (
          SOURCES.map(({ source, icon, title, label }) =>
            chip(source, label, title, () => onPick(source), icon)
          )
        ) : state.kind === 'sending' ? (
          <>
            <ActivityIndicator size="small" color={theme.textSecondary} />
            <Text
              numberOfLines={1}
              style={[styles.message, sans(400), { color: theme.textSecondary }]}>
              Sending the image…
            </Text>
            {chip('cancel', 'Stop sending', 'Cancel', onCancel)}
          </>
        ) : (
          <Text
            role="alert"
            numberOfLines={2}
            style={[styles.message, sans(400), { color: theme.danger }]}>
            {state.message}
          </Text>
        )}
      </View>
      {state.kind === 'sending' ? null : (
        <Pressable
          role="button"
          aria-label={state.kind === 'menu' ? 'Close' : 'Dismiss'}
          onPress={onClose}
          hitSlop={8}
          style={({ pressed }) => [
            styles.close,
            { borderRadius: shape.radius.pill },
            pressed && { backgroundColor: theme.backgroundSelected },
          ]}>
          <Icon name="close" size={16} />
        </Pressable>
      )}
    </View>
  );
}

const CHIP_HEIGHT = 32;

const styles = StyleSheet.create({
  strip: {
    height: CHIP_HEIGHT + Spacing.two,
    paddingTop: Spacing.two,
    paddingHorizontal: Spacing.two,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  content: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    height: CHIP_HEIGHT,
    paddingHorizontal: Spacing.three,
  },
  label: { fontSize: 14 },
  message: { flexShrink: 1, fontSize: 13, lineHeight: 16 },
  close: {
    width: CHIP_HEIGHT,
    height: CHIP_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
