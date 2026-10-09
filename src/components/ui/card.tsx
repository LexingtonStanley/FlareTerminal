import type { PropsWithChildren, ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { Icon, type IconName } from './icon';

type CardProps = PropsWithChildren<{
  /** No padding, for lists of rows that run to the card's edges. */
  flush?: boolean;
  style?: StyleProp<ViewStyle>;
}>;

/** A surface for a group of related content: a hairline-bordered card. */
export function Card({ children, flush = false, style }: CardProps) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.card,
        !flush && styles.padded,
        { backgroundColor: theme.backgroundElement, borderColor: theme.border },
        style,
      ]}>
      {children}
    </View>
  );
}

/** A hairline between rows in a flush card. */
export function Divider({ inset = 0 }: { inset?: number }) {
  const theme = useTheme();
  return <View style={[styles.divider, { backgroundColor: theme.border, marginLeft: inset }]} />;
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
  const look = CALLOUT[tone];

  return (
    <View
      style={[
        styles.callout,
        {
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
  card: {
    borderRadius: Radius.large,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  padded: { padding: Spacing.three, gap: Spacing.two + 2 },
  divider: { height: StyleSheet.hairlineWidth },
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
    borderRadius: Radius.medium,
    borderWidth: 1,
  },
  calloutIcon: { marginTop: 1 },
});
