import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { shadows, useShape, useTheme } from '@/hooks/use-theme';

import { Button } from './button';

type ConfirmDialogProps = {
  /** A question: "Run Reboot?" */
  title: string;
  /** What will happen, under the title. */
  children?: ReactNode;
  /** The confirm button's title: the action, not "OK". */
  confirmTitle: string;
  onConfirm(): void;
  /** Cancel, a tap outside the card, Escape on the web and Android's back button. */
  onCancel(): void;
};

/**
 * Asks before something that changes things: a card over the dimmed screen with Cancel and
 * the action, styled as destructive. Shown while mounted. Alert.alert does nothing on the web,
 * so this is the one way to ask everywhere.
 */
export function ConfirmDialog({
  title,
  children,
  confirmTitle,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const theme = useTheme();
  const shape = useShape();
  // Dims the screen: the canvas deepened at night, an ink wash by day.
  const scrim = useColorScheme() === 'dark' ? `${theme.background}CC` : `${theme.text}59`;

  return (
    <Modal transparent animationType="fade" onRequestClose={onCancel} aria-label={title}>
      <View style={styles.center}>
        <Pressable
          aria-hidden
          onPress={onCancel}
          style={[StyleSheet.absoluteFill, { backgroundColor: scrim }]}
        />
        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.backgroundRaised,
              borderColor: theme.border,
              borderRadius: shape.radius.large,
              borderWidth: shape.hairline,
              boxShadow: shadows(shape.shadowFloat),
            },
          ]}>
          <ThemedText type="headline" role="heading">
            {title}
          </ThemedText>
          {children}
          <View style={styles.actions}>
            <View style={styles.action}>
              <Button title="Cancel" variant="secondary" onPress={onCancel} />
            </View>
            <View style={styles.action}>
              <Button title={confirmTitle} variant="danger" onPress={onConfirm} />
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.four },
  card: {
    width: '100%',
    maxWidth: 420,
    gap: Spacing.three,
    padding: Spacing.four,
  },
  actions: { flexDirection: 'row', gap: Spacing.two + 2, marginTop: Spacing.one },
  action: { flex: 1 },
});
