import { useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Spacing } from '@/constants/theme';
import { PromptStrip } from '@/features/prompts/prompt-strip';
import type { AgentHarness } from '@/features/shortcuts/agent-command';
import { shadows, useShape, useTheme, useType } from '@/hooks/use-theme';

import type { Modifiers } from './keys';

type ComposerProps = {
  modifiers: Modifiers;
  /** The host is asking for a password: hide what's typed. */
  secure?: boolean;
  /** The draft as a paste followed by Enter. */
  onSubmit(text: string): void;
  /** A single key typed while Ctrl or Alt is armed, e.g. "c" for Ctrl+C. */
  onModifiedKey(char: string): void;
  /** The agent the session runs, whose slash commands the strip offers; null for none. */
  agent?: AgentHarness | null;
  /** Shows the strip of slash commands and saved prompts above the field. */
  suggestions?: boolean;
};

/**
 * A native text field for writing an agent prompt (or a command) with the phone's own
 * keyboard: autocorrect, swiping and dictation, which can't work in a terminal. It opens
 * focused, and Enter or the send button pastes the text and presses Enter. Above it, a strip
 * offers the agent's slash commands and saved prompts (see PromptStrip).
 */
export function Composer({
  modifiers,
  secure = false,
  onSubmit,
  onModifiedKey,
  agent = null,
  suggestions = true,
}: ComposerProps) {
  const theme = useTheme();
  const shape = useShape();
  const { sans } = useType();
  const [draft, setDraft] = useState('');
  const input = useRef<TextInput>(null);
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

  function pick(text: string) {
    setDraft(text);
    // A browser moves focus to what was clicked; on a phone the field keeps it. Either way,
    // the cursor goes after the text, ready for a command's arguments.
    input.current?.focus();
    requestAnimationFrame(() => input.current?.setSelection?.(text.length, text.length));
  }

  return (
    // On the keyboard's tray, so the key bar and the composer read as one dock.
    <View style={{ backgroundColor: theme.keyboard }}>
      {suggestions ? (
        <PromptStrip draft={draft} agent={agent} secure={secure} onPick={pick} />
      ) : null}
      <View style={styles.row}>
        <TextInput
          ref={input}
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
          cursorColor={theme.primary}
          selectionColor={theme.primary}
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
            // Prose, so the interface face (docs/design.md keeps mono for what computers read).
            sans(400),
            {
              borderRadius: shape.radius.medium,
              borderWidth: Math.max(1, shape.borderWidth),
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
            {
              backgroundColor: theme.primary,
              borderColor: theme.primaryBorder,
              borderRadius: shape.radius.medium,
              borderWidth: shape.borderWidth > 1 ? shape.borderWidth : 0,
              boxShadow: shadows(shape.glowPrimary),
            },
            pressed && styles.pressed,
          ]}>
          <Icon name="send" size={20} color="onPrimary" />
        </Pressable>
      </View>
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
    flex: 1,
    minHeight: 44,
    maxHeight: 132,
    paddingHorizontal: Spacing.three - 2,
    paddingVertical: Spacing.two,
    fontSize: 15,
    outlineWidth: 0,
  },
  send: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.8, transform: [{ scale: 0.96 }] },
});
