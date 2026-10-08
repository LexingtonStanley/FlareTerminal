import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Fonts, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import type { Modifiers, SpecialKey } from './keys';

type KeyDefinition = { label: string; name: string } & (
  { key: SpecialKey } | { text: string } | { modifier: keyof Modifiers }
);

const KEYS: KeyDefinition[] = [
  { label: 'esc', name: 'Escape', key: 'escape' },
  { label: 'tab', name: 'Tab', key: 'tab' },
  // Shift+Tab cycles modes in agent CLIs like Claude Code.
  { label: '⇧tab', name: 'Shift Tab', key: 'shift-tab' },
  { label: 'ctrl', name: 'Control', modifier: 'ctrl' },
  { label: 'alt', name: 'Alt', modifier: 'alt' },
  { label: '←', name: 'Left arrow', key: 'left' },
  { label: '↑', name: 'Up arrow', key: 'up' },
  { label: '↓', name: 'Down arrow', key: 'down' },
  { label: '→', name: 'Right arrow', key: 'right' },
  { label: '|', name: 'Pipe', text: '|' },
  { label: '~', name: 'Tilde', text: '~' },
  { label: '/', name: 'Slash', text: '/' },
  { label: '-', name: 'Dash', text: '-' },
  { label: 'home', name: 'Home', key: 'home' },
  { label: 'end', name: 'End', key: 'end' },
  { label: 'pgup', name: 'Page up', key: 'page-up' },
  { label: 'pgdn', name: 'Page down', key: 'page-down' },
];

// On web a pressed button takes focus, which closes a phone's keyboard mid-command.
// Cancelling mousedown keeps focus in the terminal or composer.
const keepFocus: object =
  Platform.OS === 'web'
    ? { onMouseDown: (event: { preventDefault(): void }) => event.preventDefault() }
    : {};

type KeyBarProps = {
  modifiers: Modifiers;
  onToggleModifier(name: keyof Modifiers): void;
  onKey(key: SpecialKey): void;
  onText(text: string): void;
};

/** The keys a phone keyboard lacks. Ctrl and Alt are sticky: they apply to the next key. */
export function KeyBar({ modifiers, onToggleModifier, onKey, onText }: KeyBarProps) {
  const theme = useTheme();

  return (
    <View
      {...keepFocus}
      role="toolbar"
      aria-label="Terminal keys"
      style={[styles.bar, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="always"
        contentContainerStyle={styles.keys}>
        {KEYS.map((definition) => {
          const isModifier = 'modifier' in definition;
          const active = isModifier && modifiers[definition.modifier];
          return (
            <Pressable
              key={definition.name}
              role={isModifier ? 'switch' : 'button'}
              aria-label={definition.name}
              aria-checked={isModifier ? active : undefined}
              onPress={() => {
                if ('modifier' in definition) onToggleModifier(definition.modifier);
                else if ('key' in definition) onKey(definition.key);
                else onText(definition.text);
              }}
              style={({ pressed }) => [
                styles.key,
                { backgroundColor: active ? theme.primary : theme.background },
                pressed && styles.pressed,
              ]}>
              <Text style={[styles.label, { color: active ? theme.onPrimary : theme.text }]}>
                {definition.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { borderTopWidth: StyleSheet.hairlineWidth },
  keys: { gap: Spacing.one, padding: Spacing.one },
  key: {
    minWidth: 44,
    minHeight: 40,
    paddingHorizontal: Spacing.two,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontFamily: Fonts.mono, fontSize: 15, fontWeight: 600 },
  pressed: { opacity: 0.6 },
});
