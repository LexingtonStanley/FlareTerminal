import type { PropsWithChildren } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ScreenProps = PropsWithChildren<{
  /**
   * Wrap content in a ScrollView that keeps the focused field above the keyboard. Use for
   * anything that can outgrow the screen, and for every form.
   */
  scroll?: boolean;
  /** Center content vertically and horizontally. */
  centered?: boolean;
  /** Safe-area edges to pad. Tab screens skip 'bottom' because the tab bar handles it. */
  edges?: Edge[];
  style?: StyleProp<ViewStyle>;
}>;

/** Root container for every screen: background, safe area, padding and a max content width. */
export function Screen({
  children,
  scroll = false,
  centered = false,
  edges = ['top', 'left', 'right'],
  style,
}: ScreenProps) {
  const theme = useTheme();
  const content = (
    <View style={[styles.content, centered && styles.centered, style]}>{children}</View>
  );

  return (
    <SafeAreaView edges={edges} style={[styles.root, { backgroundColor: theme.background }]}>
      {scroll ? (
        // Taps go through while the keyboard is open (a chip, Save) instead of only closing it.
        <KeyboardAwareScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          bottomOffset={KEYBOARD_GAP}>
          {content}
        </KeyboardAwareScrollView>
      ) : (
        content
      )}
    </SafeAreaView>
  );
}

/** Room left between the focused field and the keyboard. */
const KEYBOARD_GAP = Spacing.five;

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flexGrow: 1 },
  content: {
    flexGrow: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    padding: Spacing.four,
    gap: Spacing.three,
  },
  centered: { justifyContent: 'center' },
});
