import {
  AndroidHaptics,
  ImpactFeedbackStyle,
  impactAsync,
  performAndroidHapticsAsync,
  selectionAsync,
} from 'expo-haptics';
import { Platform } from 'react-native';

import type { Haptic } from './gestures';

// Joystick and trackpad steps can come every 30 ms; a buzz that fast feels like noise.
const MIN_GAP_MS = 45;
let lastAt = 0;

/**
 * A light tap per key, a detent per flick or arrow step, a firmer bump for a lock. On
 * Android these are the system keyboard's own haptics (no vibrate permission needed).
 * Off on the web, where the only option is a 50 ms vibration.
 */
export function playHaptic(kind: Haptic) {
  if (Platform.OS === 'web') return;
  const now = Date.now();
  if (kind !== 'lock' && now - lastAt < MIN_GAP_MS) return;
  lastAt = now;

  const done = Platform.OS === 'android' ? playAndroid(kind) : playIos(kind);
  // Haptics are a nicety: a device without them must not surface an error.
  done.catch(() => {});
}

function playAndroid(kind: Haptic) {
  switch (kind) {
    case 'key':
      return performAndroidHapticsAsync(AndroidHaptics.Keyboard_Tap);
    case 'tick':
      return performAndroidHapticsAsync(AndroidHaptics.Clock_Tick);
    case 'lock':
      return performAndroidHapticsAsync(AndroidHaptics.Long_Press);
  }
}

function playIos(kind: Haptic) {
  switch (kind) {
    case 'key':
      return impactAsync(ImpactFeedbackStyle.Light);
    case 'tick':
      return selectionAsync();
    case 'lock':
      return impactAsync(ImpactFeedbackStyle.Medium);
  }
}
