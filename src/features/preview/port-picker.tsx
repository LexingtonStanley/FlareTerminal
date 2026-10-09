import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { useShape, useTheme, useType } from '@/hooks/use-theme';

import { parsePort } from './local-urls';

/**
 * Which port on the host to preview: one a dev server printed in the session (`found`),
 * or one typed in.
 */
export function PortPicker({
  host,
  found,
  initial,
  onPick,
}: {
  host: string;
  found: number[];
  initial: number | null;
  onPick(port: number): void;
}) {
  const theme = useTheme();
  const shape = useShape();
  const { mono } = useType();
  const [text, setText] = useState(initial ? String(initial) : '');
  const [error, setError] = useState<string | null>(null);

  function submit() {
    const port = parsePort(text);
    if (!port) return setError('A port from 1 to 65535, like 3000');
    onPick(port);
  }

  return (
    <Screen scroll edges={['left', 'right', 'bottom']} style={styles.screen}>
      <ThemedText themeColor="textSecondary">
        Open a page served on {host}, such as the app your agent is building.
      </ThemedText>

      {found.length ? (
        <View style={styles.field}>
          <ThemedText type="eyebrow" themeColor="textSecondary">
            In this session
          </ThemedText>
          <View style={styles.chips}>
            {found.map((port) => (
              <Pressable
                key={port}
                role="button"
                aria-label={`Preview localhost:${port}`}
                onPress={() => onPick(port)}
                style={({ pressed }) => [
                  styles.chip,
                  {
                    backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement,
                    borderColor: theme.border,
                    borderRadius: shape.radius.pill,
                    borderWidth: shape.hairline,
                  },
                ]}>
                <Text style={[styles.chipText, mono(500), { color: theme.text }]}>
                  localhost:{port}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      <TextField
        label="Port"
        testID="preview-port"
        placeholder="3000"
        monospace
        keyboardType="number-pad"
        returnKeyType="go"
        value={text}
        onChangeText={(next) => {
          setText(next);
          setError(null);
        }}
        onSubmitEditing={submit}
        error={error ?? undefined}
      />
      <Button title="Open preview" icon="preview" onPress={submit} />

      <Callout>
        Flare forwards the port through this session’s SSH connection, as ssh -L does. Only this
        phone can open it, and it closes when you leave the preview.
      </Callout>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { gap: Spacing.three + 4 },
  field: { gap: Spacing.two - 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
  },
  chipText: { fontSize: 14 },
});
