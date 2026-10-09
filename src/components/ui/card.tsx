import type { PropsWithChildren, ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing, type ThemeColor } from '@/constants/theme';
import { shadows, useShape, useTheme } from '@/hooks/use-theme';

import { Icon, type IconName } from './icon';

type CardProps = PropsWithChildren<{
  /** No padding, for lists of rows that run to the card's edges. */
  flush?: boolean;
  style?: StyleProp<ViewStyle>;
}>;

/** A surface for a group of related content: a bordered card, raised in some themes. */
export function Card({ children, flush = false, style }: CardProps) {
  const theme = useTheme();
  const shape = useShape();

  return (
    <View
      style={[
        styles.card,
        !flush && styles.padded,
        {
          backgroundColor: theme.backgroundElement,
          borderColor: theme.border,
          borderRadius: shape.radius.large,
          borderWidth: shape.hairline,
          boxShadow: shadows(shape.shadowCard),
        },
        style,
      ]}>
      {children}
    </View>
  );
}

/** A hairline between rows in a flush card. */
export function Divider({ inset = 0 }: { inset?: number }) {
  const theme = useTheme();
  const { hairline } = useShape();
  return <View style={{ height: hairline, backgroundColor: theme.border, marginLeft: inset }} />;
}

type SectionProps = PropsWithChildren<{
  title: string;
  /** Shown at the end of the title row: a count, or a small action. */
  accessory?: ReactNode;
}>;

/** A titled group on a screen. The title is a heading for screen readers. */
export function Section({ title, accessory, children }: SectionProps) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <ThemedText type="overline" role="heading" themeColor="textSecondary" style={styles.grow}>
          {title}
        </ThemedText>
        {accessory}
      </View>
      {children}
    </View>
  );
}

type CalloutProps = {
  tone?: 'info' | 'warning';
  children: ReactNode;
};

const CALLOUT: Record<
  NonNullable<CalloutProps['tone']>,
  { icon: IconName; color: ThemeColor; text: ThemeColor }
> = {
  info: { icon: 'info', color: 'textSecondary', text: 'textSecondary' },
  warning: { icon: 'warning', color: 'danger', text: 'danger' },
};

/** A short note in the flow of a form: what to know before going on. */
export function Callout({ tone = 'info', children }: CalloutProps) {
  const theme = useTheme();
  const shape = useShape();
  const look = CALLOUT[tone];

  return (
    <View
      style={[
        styles.callout,
        {
          borderRadius: shape.radius.medium,
          borderWidth: Math.max(1, shape.borderWidth),
          backgroundColor: tone === 'info' ? theme.backgroundSelected : 'transparent',
          borderColor: tone === 'info' ? 'transparent' : theme.danger,
        },
      ]}>
      <Icon name={look.icon} size={18} color={look.color} style={styles.calloutIcon} />
      <ThemedText type="small" themeColor={look.text} style={styles.grow}>
        {children}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  // Clips rows to the corners; a card's own shadow still draws outside it.
  card: { overflow: 'hidden' },
  padded: { padding: Spacing.three, gap: Spacing.two + 2 },
  section: { gap: Spacing.two + 2 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.one,
  },
  grow: { flex: 1 },
  callout: {
    flexDirection: 'row',
    gap: Spacing.two + 2,
    padding: Spacing.three - 2,
  },
  calloutIcon: { marginTop: 1 },
});
