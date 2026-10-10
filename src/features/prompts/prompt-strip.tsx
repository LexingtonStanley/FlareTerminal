import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Spacing } from '@/constants/theme';
import { useShape, useTheme, useType } from '@/hooks/use-theme';
import type { AgentHarness } from '@/features/shortcuts/agent-command';

import { promptTitle, quietHint, suggest, type Suggestion } from './prompts';
import { usePrompts } from './prompts-provider';

type PromptStripProps = {
  draft: string;
  /** The agent the session runs, whose slash commands it offers; null for none. */
  agent: AgentHarness | null;
  /** The host is asking for a password: offer nothing. */
  secure: boolean;
  /** A chip was tapped: this text becomes the draft. */
  onPick(text: string): void;
};

/**
 * A row of chips above the composer's field, like the phone keyboard's suggestions: the
 * agent's slash commands and the person's saved prompts, narrowed as they write, or a chip
 * that saves what they wrote. A chip fills the field and doesn't send, so a command can take
 * arguments and nothing reaches the agent by accident. The row keeps its height when it has
 * nothing to offer, since a change of height resizes the terminal.
 */
export function PromptStrip({ draft, agent, secure, onPick }: PromptStripProps) {
  const theme = useTheme();
  const shape = useShape();
  const { sans, mono } = useType();
  const { prompts, add } = usePrompts();
  const items = secure ? [] : suggest(draft, agent, prompts);

  function chip(item: Suggestion) {
    const machine =
      item.kind === 'command' || (item.kind === 'prompt' && item.text.startsWith('/'));
    const [key, label, title] =
      item.kind === 'command'
        ? [item.text, `${item.text}, ${item.description}`, item.text]
        : item.kind === 'prompt'
          ? [item.id, promptTitle(item.text), promptTitle(item.text)]
          : ['save', 'Save as prompt', 'Save as prompt'];

    return (
      <Pressable
        key={key}
        role="button"
        aria-label={label}
        onPress={() => (item.kind === 'save' ? add(draft) : onPick(item.text))}
        hitSlop={{ top: 4, bottom: 4 }}
        style={({ pressed }) => [
          styles.chip,
          {
            borderRadius: shape.radius.pill,
            borderWidth: shape.hairline,
            borderColor: theme.border,
            backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement,
          },
        ]}>
        {item.kind === 'command' ? null : (
          <Icon name={item.kind === 'save' ? 'savePrompt' : 'prompt'} size={14} />
        )}
        <Text
          numberOfLines={1}
          style={[styles.label, machine ? mono(500) : sans(500), { color: theme.text }]}>
          {title}
        </Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.strip}>
      {items.length ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          aria-label="Suggestions"
          // A tap on a chip mustn't close the keyboard first.
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.chips}>
          {items.map(chip)}
        </ScrollView>
      ) : (
        <Text numberOfLines={1} style={[styles.hint, sans(400), { color: theme.textSecondary }]}>
          {secure ? 'Hidden while typing a password' : quietHint(draft, agent, prompts)}
        </Text>
      )}
    </View>
  );
}

const CHIP_HEIGHT = 32;

const styles = StyleSheet.create({
  strip: { height: CHIP_HEIGHT + Spacing.two, paddingTop: Spacing.two, justifyContent: 'center' },
  chips: { alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.two },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    height: CHIP_HEIGHT,
    maxWidth: 240,
    paddingHorizontal: Spacing.three,
  },
  label: { fontSize: 14, flexShrink: 1 },
  hint: { fontSize: 13, paddingHorizontal: Spacing.three },
});
