import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Fonts, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import type { Modifiers } from './keys';

type ComposerProps = {
  modifiers: Modifiers;
  /** The draft as a paste followed by Enter. */
  onSubmit(text: string): void;
  /** A single key typed while Ctrl or Alt is armed, e.g. "c" for Ctrl+C. */
  onModifiedKey(char: string): void;
};

/**
 * A native text field for writing a command or an agent prompt before sending it.
 * Phone keyboards, autocorrect and dictation work here even where typing straight
 * into the terminal doesn't (Android IMEs hold back xterm.js input until Enter).
 */
export function Composer({ modifiers, onSubmit, onModifiedKey }: ComposerProps) {
  const theme = useTheme();
  const [draft, setDraft] = useState('');
  const armed = modifiers.ctrl || modifiers.alt;

  function handleChange(next: string) {
    // With a modifier armed, the next character is a key combination, not text.
    if (armed && next.length === draft.length + 1 && next.startsWith(draft)) {
      onModifiedKey(next.slice(-1));
      return;
    }
    setDraft(next);
  }

  function submit() {
    onSubmit(draft);
    setDraft('');
  }

  return (
    <View style={[styles.row, { backgroundColor: theme.backgroundElement }]}>
      <TextInput
        aria-label="Command"
        value={draft}
        onChangeText={handleChange}
        onSubmitEditing={submit}
        submitBehavior="submit"
        placeholder={armed ? 'Type a key for the combination' : 'Command or prompt'}
        placeholderTextColor={theme.textSecondary}
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        returnKeyType="send"
        style={[
          styles.input,
          { color: theme.text, backgroundColor: theme.background, borderColor: theme.border },
        ]}
      />
      <Pressable
        role="button"
        aria-label="Send"
        onPress={submit}
        style={({ pressed }) => [
          styles.send,
          { backgroundColor: theme.primary },
          pressed && styles.pressed,
        ]}>
        <Text style={[styles.sendLabel, { color: theme.onPrimary }]}>↵</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: Spacing.two, padding: Spacing.two, alignItems: 'center' },
  input: {
    flex: 1,
    minHeight: 44,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
    borderWidth: 1,
    fontFamily: Fonts.mono,
    fontSize: 15,
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendLabel: { fontSize: 20, fontWeight: 700 },
  pressed: { opacity: 0.8 },
});
