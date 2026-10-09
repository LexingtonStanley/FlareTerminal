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
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Screen } from '@/components/ui/screen';
import { TextField } from '@/components/ui/text-field';
import { Radius, sans, Spacing } from '@/constants/theme';
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
      <Screen scroll edges={['left', 'right', 'bottom']} style={styles.screen}>
        <View style={styles.group}>
          <ThemedText type="eyebrow" themeColor="textSecondary">
            Start from
          </ThemedText>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.bleed}
            contentContainerStyle={styles.chips}>
            {SHORTCUT_PRESETS.map((preset) => {
              const chosen = values.command === preset.command;
              return (
                <Pressable
                  key={preset.label}
                  role="button"
                  aria-label={`Use ${preset.label}`}
                  onPress={() => set({ command: preset.command, name: values.name || preset.name })}
                  style={({ pressed }) => [
                    styles.chip,
                    {
                      backgroundColor: chosen
                        ? theme.primaryMuted
                        : pressed
                          ? theme.backgroundSelected
                          : theme.backgroundElement,
                      borderColor: chosen ? theme.primary : theme.border,
                    },
                  ]}>
                  <ThemedText
                    type="small"
                    themeColor={chosen ? 'primary' : 'text'}
                    style={styles.chipText}>
                    {preset.label}
                  </ThemedText>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <TextField label="Name" placeholder="Claude" {...field('name')} />

        <View style={styles.group}>
          <ThemedText type="eyebrow" themeColor="textSecondary">
            Connection
          </ThemedText>
          <View
            role="radiogroup"
            aria-label="Connection"
            style={[
              styles.options,
              {
                backgroundColor: theme.backgroundElement,
                borderColor: errors.connectionId ? theme.danger : theme.border,
              },
            ]}>
            {connections.map((connection, index) => {
              const selected = values.connectionId === connection.id;
              return (
                <Pressable
                  key={connection.id}
                  role="radio"
                  aria-checked={selected}
                  aria-label={connection.name}
                  onPress={() => set({ connectionId: connection.id })}
                  style={({ pressed }) => [
                    styles.option,
                    index > 0 && [styles.optionDivider, { borderTopColor: theme.border }],
                    pressed && { backgroundColor: theme.backgroundSelected },
                  ]}>
                  <View
                    style={[
                      styles.radio,
                      { borderColor: selected ? theme.primary : theme.textSecondary },
                    ]}>
                    {selected ? (
                      <View style={[styles.radioDot, { backgroundColor: theme.primary }]} />
                    ) : null}
                  </View>
                  <View style={styles.optionText}>
                    <ThemedText type="smallBold">{connection.name}</ThemedText>
                    <ThemedText type="code" themeColor="textSecondary" numberOfLines={1}>
                      {connectionLabel(connection)}
                    </ThemedText>
                  </View>
                </Pressable>
              );
            })}
          </View>
          {errors.connectionId ? (
            <View style={styles.message}>
              <Icon name="error" size={15} color="danger" />
              <ThemedText type="small" themeColor="danger">
                {errors.connectionId}
              </ThemedText>
            </View>
          ) : null}
        </View>

        <TextField
          label="Command"
          placeholder="tmux new -A -s claude claude"
          autoCapitalize="none"
          autoCorrect={false}
          monospace
          {...field('command')}
        />
        <TextField
          label="Folder"
          placeholder="Optional, e.g. ~/code/my-app"
          autoCapitalize="none"
          autoCorrect={false}
          monospace
          {...field('directory')}
        />

        {values.command.trim() ? (
          <View style={styles.group}>
            <ThemedText type="eyebrow" themeColor="textSecondary">
              Runs
            </ThemedText>
            <View
              style={[
                styles.preview,
                { backgroundColor: theme.backgroundSelected, borderColor: theme.border },
              ]}>
              <ThemedText type="code" themeColor="primary">
                $
              </ThemedText>
              <ThemedText type="code" selectable style={styles.previewCommand}>
                {startupCommand(values)}
              </ThemedText>
            </View>
          </View>
        ) : null}

        <View style={styles.actions}>
          <Button title="Save" onPress={submit} />
          {onDelete ? (
            <Button
              title={confirmingDelete ? 'Tap again to delete' : 'Delete shortcut'}
              variant="danger"
              onPress={() => (confirmingDelete ? onDelete() : setConfirmingDelete(true))}
            />
          ) : null}
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { gap: Spacing.three + 4 },
  group: { gap: Spacing.two - 2 },
  // The chips scroll to the screen's edges.
  bleed: { marginHorizontal: -Spacing.four, flexGrow: 0 },
  chips: { flexDirection: 'row', gap: Spacing.two, paddingHorizontal: Spacing.four },
  chip: {
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: Spacing.three - 2,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  chipText: sans(500),
  options: { borderRadius: Radius.medium, borderWidth: 1, overflow: 'hidden' },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three - 4,
    paddingHorizontal: Spacing.three - 2,
    paddingVertical: Spacing.three - 4,
  },
  optionDivider: { borderTopWidth: StyleSheet.hairlineWidth },
  optionText: { flex: 1, gap: Spacing.half },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  message: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one + 2 },
  preview: {
    flexDirection: 'row',
    gap: Spacing.two,
    padding: Spacing.three - 2,
    borderRadius: Radius.medium,
    borderWidth: StyleSheet.hairlineWidth,
  },
  previewCommand: { flex: 1 },
  actions: { gap: Spacing.two + 2, marginTop: Spacing.two },
});
