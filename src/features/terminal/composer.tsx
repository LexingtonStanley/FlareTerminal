import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Spacing } from '@/constants/theme';
import { AttachRow } from '@/features/images/attach-row';
import { NoImage, type ImageSource } from '@/features/images/image-source';
import { insertPath, SendCancelled } from '@/features/images/upload';
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
  /**
   * Sends an image to the host and resolves to its path there, or to null when the person
   * didn't pick one. Missing when the host can't take images.
   */
  onAttachImage?: ((source: ImageSource, signal: AbortSignal) => Promise<string | null>) | null;
};

type Attach =
  | { kind: 'closed' }
  | { kind: 'menu' }
  | { kind: 'sending'; controller: AbortController }
  | { kind: 'failed'; message: string };

/**
 * A native text field for writing an agent prompt (or a command) with the phone's own
 * keyboard: autocorrect, swiping and dictation, which can't work in a terminal. It opens
 * focused, and Enter or the send button pastes the text and presses Enter. Above it, a strip
 * offers the agent's slash commands and saved prompts (see PromptStrip). Over SSH, the image
 * button sends a screenshot or photo to the host and writes its path into the prompt.
 */
export function Composer({
  modifiers,
  secure = false,
  onSubmit,
  onModifiedKey,
  agent = null,
  suggestions = true,
  onAttachImage = null,
}: ComposerProps) {
  const theme = useTheme();
  const shape = useShape();
  const { sans } = useType();
  const [draft, setDraft] = useState('');
  const input = useRef<TextInput>(null);
  const armed = modifiers.ctrl || modifiers.alt;
  const [attach, setAttach] = useState<Attach>({ kind: 'closed' });
  // What's written when an image arrives: the person may type while it's on its way.
  const latestDraft = useRef(draft);
  useEffect(() => {
    latestDraft.current = draft;
  });

  // Leaving the session, or finishing, stops an upload still on its way.
  useEffect(() => {
    if (attach.kind !== 'sending') return;
    const { controller } = attach;
    return () => controller.abort();
  }, [attach]);

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

  async function attachImage(source: ImageSource) {
    if (!onAttachImage) return;
    const controller = new AbortController();
    setAttach({ kind: 'sending', controller });
    try {
      const path = await onAttachImage(source, controller.signal);
      setAttach({ kind: 'closed' });
      // The person backed out of the picker.
      if (path !== null) pick(insertPath(latestDraft.current, path));
    } catch (error) {
      const { message } = error as Error;
      setAttach(
        error instanceof SendCancelled
          ? { kind: 'closed' }
          : {
              kind: 'failed',
              message: error instanceof NoImage ? message : `Couldn’t send the image. ${message}`,
            }
      );
    }
  }

  return (
    // On the keyboard's tray, so the key bar and the composer read as one dock.
    <View style={{ backgroundColor: theme.keyboard }}>
      {attach.kind !== 'closed' && !secure ? (
        <AttachRow
          state={attach.kind === 'sending' ? { kind: 'sending' } : attach}
          onPick={(source) => void attachImage(source)}
          onCancel={() => attach.kind === 'sending' && attach.controller.abort()}
          onClose={() => setAttach({ kind: 'closed' })}
        />
      ) : suggestions ? (
        <PromptStrip draft={draft} agent={agent} secure={secure} onPick={pick} />
      ) : null}
      <View style={styles.row}>
        {onAttachImage && !secure ? (
          <Pressable
            role="button"
            aria-label="Attach an image"
            aria-expanded={attach.kind !== 'closed'}
            disabled={attach.kind === 'sending'}
            onPress={() =>
              setAttach(attach.kind === 'menu' ? { kind: 'closed' } : { kind: 'menu' })
            }
            style={({ pressed }) => [
              styles.attach,
              {
                borderRadius: shape.radius.medium,
                borderWidth: Math.max(1, shape.borderWidth),
                borderColor: theme.border,
                // Held down while the menu is open; the send button keeps the accent.
                backgroundColor:
                  pressed || attach.kind !== 'closed'
                    ? theme.backgroundSelected
                    : theme.backgroundElement,
              },
            ]}>
            <Icon
              name="image"
              size={20}
              color={attach.kind === 'closed' ? 'textSecondary' : 'text'}
            />
          </Pressable>
        ) : null}
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
  attach: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.8, transform: [{ scale: 0.96 }] },
});
