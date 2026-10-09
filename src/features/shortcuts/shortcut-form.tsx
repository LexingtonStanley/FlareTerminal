import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { connectionLabel, type Connection } from '@/features/connections/connections';
import { useTheme } from '@/hooks/use-theme';

import {
  EMPTY_SHORTCUT_INPUT,
  SHORTCUT_PRESETS,
  startupCommand,
  validateShortcut,
  type ShortcutErrors,
  type ShortcutInput,
} from './shortcuts';

type ShortcutFormProps = {
  connections: Connection[];
  initial?: ShortcutInput;
  onSubmit(input: ShortcutInput): void;
  onDelete?(): void;
};

export function ShortcutForm({
  connections,
  initial = EMPTY_SHORTCUT_INPUT,
  onSubmit,
  onDelete,
}: ShortcutFormProps) {
  const theme = useTheme();
  const [values, setValues] = useState<ShortcutInput>(() => ({
    ...initial,
    // One connection: nothing to choose.
    connectionId: initial.connectionId || (connections.length === 1 ? connections[0].id : ''),
  }));
  const [errors, setErrors] = useState<ShortcutErrors>({});
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const set = (changes: Partial<ShortcutInput>) =>
    setValues((current) => ({ ...current, ...changes }));
  const field = (name: 'name' | 'command' | 'directory') => ({
    value: values[name],
    onChangeText: (text: string) => set({ [name]: text }),
    error: errors[name],
  });

  function submit() {
    const next = validateShortcut(values);
    setErrors(next);
    if (Object.keys(next).length === 0) onSubmit(values);
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen scroll edges={['left', 'right', 'bottom']}>
        <View style={styles.group}>
          <ThemedText type="smallBold">Start from</ThemedText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.chips}>
              {SHORTCUT_PRESETS.map((preset) => (
                <Pressable
                  key={preset.label}
                  role="button"
                  aria-label={`Use ${preset.label}`}
                  onPress={() => set({ command: preset.command, name: values.name || preset.name })}
                  style={({ pressed }) => [
                    styles.chip,
                    {
                      backgroundColor:
                        values.command === preset.command
                          ? theme.backgroundSelected
                          : theme.backgroundElement,
                    },
                    pressed && styles.pressed,
                  ]}>
                  <ThemedText type="small">{preset.label}</ThemedText>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </View>

        <TextField label="Name" placeholder="Claude" {...field('name')} />

        <View style={styles.group}>
          <ThemedText type="smallBold">Connection</ThemedText>
          <View role="radiogroup" aria-label="Connection" style={styles.group}>
            {connections.map((connection) => {
              const selected = values.connectionId === connection.id;
              return (
                <Pressable
                  key={connection.id}
                  role="radio"
                  aria-checked={selected}
                  aria-label={connection.name}
                  onPress={() => set({ connectionId: connection.id })}
                  style={[
                    styles.option,
                    {
                      backgroundColor: theme.backgroundElement,
                      borderColor: selected ? theme.primary : theme.backgroundElement,
                    },
                  ]}>
                  <ThemedText type="smallBold">{connection.name}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {connectionLabel(connection)}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
          {errors.connectionId ? (
            <ThemedText type="small" style={{ color: theme.danger }}>
              {errors.connectionId}
            </ThemedText>
          ) : null}
        </View>

        <TextField
          label="Command"
          placeholder="tmux new -A -s claude claude"
          autoCapitalize="none"
          autoCorrect={false}
          {...field('command')}
        />
        <TextField
          label="Folder"
          placeholder="Optional, e.g. ~/code/my-app"
          autoCapitalize="none"
          autoCorrect={false}
          {...field('directory')}
        />

        {values.command.trim() ? (
          <ThemedView type="backgroundElement" style={styles.preview}>
            <ThemedText type="small" themeColor="textSecondary">
              Runs:
            </ThemedText>
            <ThemedText type="code" selectable>
              {startupCommand(values)}
            </ThemedText>
          </ThemedView>
        ) : null}

        <Button title="Save" onPress={submit} />
        {onDelete ? (
          <Button
            title={confirmingDelete ? 'Tap again to delete' : 'Delete shortcut'}
            variant="secondary"
            onPress={() => (confirmingDelete ? onDelete() : setConfirmingDelete(true))}
          />
        ) : null}
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  group: { gap: Spacing.two },
  chips: { flexDirection: 'row', gap: Spacing.two },
  chip: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, borderRadius: 999 },
  option: {
    gap: Spacing.half,
    padding: Spacing.three,
    borderRadius: Spacing.three,
    borderWidth: 2,
  },
  preview: { gap: Spacing.one, padding: Spacing.three, borderRadius: Spacing.three },
  pressed: { opacity: 0.7 },
});
