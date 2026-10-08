import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { secretsSupported } from '@/lib/secrets';

import {
  connectionWarning,
  validateConnection,
  type ConnectionErrors,
  type ConnectionInput,
} from './connections';

type ConnectionFormProps = {
  initial?: ConnectionInput;
  submitLabel: string;
  onSubmit(input: ConnectionInput): void;
  onDelete?(): void;
};

const EMPTY: ConnectionInput = { name: '', url: '', username: '', password: '' };

export function ConnectionForm({
  initial = EMPTY,
  submitLabel,
  onSubmit,
  onDelete,
}: ConnectionFormProps) {
  const theme = useTheme();
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<ConnectionErrors>({});
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const warning = connectionWarning(values.url);

  const field = (name: keyof ConnectionInput) => ({
    value: values[name],
    onChangeText: (text: string) => setValues((current) => ({ ...current, [name]: text })),
    error: errors[name as keyof ConnectionErrors],
  });

  function submit() {
    const next = validateConnection(values);
    setErrors(next);
    if (Object.keys(next).length === 0) onSubmit(values);
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen scroll edges={['left', 'right', 'bottom']}>
        <TextField
          label="Name"
          placeholder="Devbox"
          returnKeyType="next"
          testID="connection-name"
          {...field('name')}
        />
        <TextField
          label="Address"
          placeholder="https://devbox.tailnet.ts.net or 192.168.1.20:7681"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          textContentType="URL"
          returnKeyType="next"
          testID="connection-address"
          {...field('url')}
        />
        {warning ? (
          <ThemedText type="small" style={{ color: theme.danger }}>
            {warning}
          </ThemedText>
        ) : null}

        {secretsSupported ? (
          <>
            <TextField
              label="Username"
              placeholder="Optional: the user from ttyd -c user:password"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="username"
              textContentType="username"
              returnKeyType="next"
              {...field('username')}
            />
            <TextField
              label="Password"
              secureTextEntry
              autoCapitalize="none"
              autoComplete="password"
              textContentType="password"
              returnKeyType="done"
              onSubmitEditing={submit}
              {...field('password')}
            />
          </>
        ) : (
          <ThemedView type="backgroundElement" style={styles.note}>
            <ThemedText type="small" themeColor="textSecondary">
              Browsers can&apos;t send a ttyd username and password. Use the Android or iOS app for
              hosts started with -c, or put ttyd behind a sign-in proxy.
            </ThemedText>
          </ThemedView>
        )}

        <Button title={submitLabel} onPress={submit} testID="connection-save" />
        {onDelete ? (
          <Button
            title={confirmingDelete ? 'Tap again to delete' : 'Delete connection'}
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
  note: { padding: Spacing.three, borderRadius: Spacing.three },
});
