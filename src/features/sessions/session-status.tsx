import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing, type ThemeColor } from '@/constants/theme';
import type { SessionStatus } from '@/features/terminal/transport';
import { useShape, useTheme } from '@/hooks/use-theme';

export const STATUS_LABELS: Record<SessionStatus['state'], string> = {
  connecting: 'Connecting',
  connected: 'Connected',
  closed: 'Disconnected',
};

const STATUS_COLORS: Record<SessionStatus['state'], ThemeColor> = {
  connecting: 'warning',
  connected: 'success',
  closed: 'danger',
};

export function useStatusColor(status: SessionStatus) {
  return useTheme()[STATUS_COLORS[status.state]];
}

function useReduceMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then(
      (enabled) => mounted && setReduce(enabled),
      () => {}
    );
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);
  return reduce;
}

type LiveDotProps = {
  color: string;
  /** Breathes while something is in progress (connecting). */
  pulsing?: boolean;
  size?: number;
};

/** A status light: a dot in a soft halo of its own colour. */
export function LiveDot({ color, pulsing = false, size = 8 }: LiveDotProps) {
  const reduceMotion = useReduceMotion();
  const { radius } = useShape();
  // Round, or square in themes whose dots are (Concrete).
  const round = (width: number) => Math.min(radius.dot, width / 2);
  const [pulse] = useState(() => new Animated.Value(0));
  const animate = pulsing && !reduceMotion;

  useEffect(() => {
    if (!animate) {
      pulse.setValue(0);
      return;
    }
    const step = (toValue: number) =>
      Animated.timing(pulse, {
        toValue,
        duration: 700,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: Platform.OS !== 'web',
      });
    const loop = Animated.loop(Animated.sequence([step(1), step(0)]));
    loop.start();
    return () => loop.stop();
  }, [animate, pulse]);

  const halo = size * 2;
  return (
    <View aria-hidden style={[styles.dotBox, { width: halo, height: halo }]}>
      <Animated.View
        style={[
          styles.halo,
          {
            width: halo,
            height: halo,
            borderRadius: round(halo),
            backgroundColor: color,
            opacity: animate
              ? pulse.interpolate({ inputRange: [0, 1], outputRange: [0.1, 0.35] })
              : 0.18,
            transform: animate
              ? [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1.15] }) }]
              : [],
          },
        ]}
      />
      <View
        style={{ width: size, height: size, borderRadius: round(size), backgroundColor: color }}
      />
    </View>
  );
}

export function StatusDot({ status }: { status: SessionStatus }) {
  return <LiveDot color={useStatusColor(status)} pulsing={status.state === 'connecting'} />;
}

/** The session's connection state in the header: a light and a word. */
export function StatusBadge({ status }: { status: SessionStatus }) {
  const theme = useTheme();
  const shape = useShape();

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: theme.backgroundElement,
          borderColor: theme.border,
          borderRadius: shape.radius.pill,
          borderWidth: shape.hairline,
        },
      ]}
      aria-label={`Status: ${STATUS_LABELS[status.state]}`}>
      <StatusDot status={status} />
      <ThemedText type="caption" themeColor="textSecondary">
        {STATUS_LABELS[status.state]}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.half,
    height: 28,
    paddingLeft: Spacing.one,
    paddingRight: Spacing.two + 2,
  },
  dotBox: { alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute' },
});
