import { useLayoutEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { mono, Radius, sans, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { Icon } from './icon';

type TextFieldProps = Omit<TextInputProps, 'style'> & {
  label: string;
  error?: string;
  /** Helper text under the field, hidden while an error shows. */
  hint?: string;
  /** Monospace, for what a computer reads: hosts, addresses, commands, paths. */
  monospace?: boolean;
};

/** Labelled text input with an inline error. The label doubles as the accessible name. */
export function TextField({
  label,
  error,
  hint,
  monospace = false,
  onFocus,
  onBlur,
  ...inputProps
}: TextFieldProps) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const input = useRef<TextInput>(null);
  const { multiline, value } = inputProps;

  // Android and iOS grow a multiline field with its text; a browser's textarea doesn't.
  useLayoutEffect(() => {
    const node = input.current as unknown as HTMLTextAreaElement | null;
    if (Platform.OS !== 'web' || !multiline || !node?.style) return;
    node.style.height = 'auto';
    node.style.height = `${node.scrollHeight + 2}px`;
  }, [multiline, value]);

  return (
    <View style={styles.container}>
      <ThemedText type="eyebrow" themeColor="textSecondary">
        {label}
      </ThemedText>
      <TextInput
        ref={input}
        aria-label={label}
        placeholderTextColor={theme.textSecondary}
        cursorColor={theme.primary}
        selectionColor={theme.primary}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        style={[
          styles.input,
          monospace ? styles.mono : styles.sans,
          multiline && styles.multiline,
          {
            color: theme.text,
            backgroundColor: theme.backgroundElement,
            borderColor: error ? theme.danger : focused ? theme.primary : theme.border,
          },
          focused && { boxShadow: `0 0 0 3px ${error ? theme.danger : theme.primary}26` },
        ]}
        {...inputProps}
      />
      {error ? (
        <View style={styles.message}>
          <Icon name="error" size={15} color="danger" />
          <ThemedText type="small" themeColor="danger" style={styles.messageText}>
            {error}
          </ThemedText>
        </View>
      ) : hint ? (
        <ThemedText type="caption" themeColor="textSecondary">
          {hint}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.two - 2 },
  input: {
    minHeight: 50,
    paddingHorizontal: Spacing.three - 2,
    borderRadius: Radius.medium,
    borderWidth: 1,
    fontSize: 16,
    // Web draws its own focus ring; the border and glow above replace it.
    outlineWidth: 0,
  },
  sans: sans(400),
  mono: { ...mono(400), fontSize: 15 },
  multiline: { paddingVertical: Spacing.three - 3, lineHeight: 21, textAlignVertical: 'top' },
  message: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one + 2 },
  messageText: { flexShrink: 1 },
});
