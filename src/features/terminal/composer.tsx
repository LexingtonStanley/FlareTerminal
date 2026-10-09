import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { mono, Radius, Spacing } from '@/constants/theme';
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
 * A native text field for writing a command or an agent prompt before sending it.
 * Phone keyboards, autocorrect and dictation work here even where typing straight
 * into the terminal doesn't (Android IMEs hold back xterm.js input until Enter).
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
    // On the keyboard's tray, so the key bar and the composer read as one dock.
    <View style={[styles.row, { backgroundColor: theme.keyboard }]}>
      <TextInput
        aria-label="Command"
        value={draft}
        onChangeText={handleChange}
        onSubmitEditing={submit}
        submitBehavior="submit"
        placeholder={
          armed ? 'Type a key for the combination' : secure ? 'Password' : 'Command or prompt'
        }
        secureTextEntry={secure}
        placeholderTextColor={theme.textSecondary}
        cursorColor={theme.primary}
        selectionColor={theme.primary}
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        returnKeyType="send"
        style={[
          styles.input,
          {
            color: theme.text,
            backgroundColor: theme.background,
            borderColor: armed ? theme.primary : theme.border,
          },
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
        <Icon name="send" size={20} color="onPrimary" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingTop: Spacing.one,
    paddingBottom: Spacing.two,
    alignItems: 'center',
  },
  input: {
    ...mono(400),
    flex: 1,
    minHeight: 44,
    paddingHorizontal: Spacing.three - 2,
    borderRadius: Radius.medium,
    borderWidth: 1,
    fontSize: 15,
    outlineWidth: 0,
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: Radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.8, transform: [{ scale: 0.96 }] },
});
