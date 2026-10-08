import type { PropsWithChildren } from 'react';
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ScreenProps = PropsWithChildren<{
  /** Wrap content in a ScrollView. Use for anything that can outgrow the screen. */
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
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {content}
        </ScrollView>
      ) : (
        content
      )}
    </SafeAreaView>
  );
}

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
