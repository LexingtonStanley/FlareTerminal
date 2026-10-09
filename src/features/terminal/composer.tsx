import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Fonts, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import type { Modifiers } from './keys';

type ComposerProps = {
  modifiers: Modifiers;
  /** The host is asking for a password: hide what's typed. */
  secure?: boolean;
  /** The draft as a paste followed by Enter. */
  onSubmit(text: string): void;
  /** A single key typed while Ctrl or Alt is armed, e.g. "c" for Ctrl+C. */
  onModifiedKey(char: string): void;
};

/**
 * A native text field for writing an agent prompt (or a command) with the phone's own
 * keyboard: autocorrect, swiping and dictation, which can't work in a terminal. It opens
 * focused, and Enter or the send button pastes the text and presses Enter.
 */
export function Composer({ modifiers, secure = false, onSubmit, onModifiedKey }: ComposerProps) {
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
        autoFocus
        value={draft}
        onChangeText={handleChange}
        onSubmitEditing={submit}
        submitBehavior="submit"
        placeholder={
          armed ? 'Type a key for the combination' : secure ? 'Password' : 'Write a prompt'
        }
        secureTextEntry={secure}
        placeholderTextColor={theme.textSecondary}
        // Prose: let the phone's keyboard help. (Commands are easier on the coding keyboard.)
        autoCapitalize={secure ? 'none' : 'sentences'}
        autoCorrect={!secure}
        spellCheck={!secure}
        // Grows for long prompts; Enter still sends. (react-native-web only sends from a
        // multiline field by blurring it, which would close the keyboard each time.)
        multiline={!secure && Platform.OS !== 'web'}
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
    maxHeight: 132,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
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
