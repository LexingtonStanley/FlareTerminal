import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Callout, Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Screen } from '@/components/ui/screen';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { TextField } from '@/components/ui/text-field';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { secretsSupported } from '@/lib/secrets';

import {
  connectionWarning,
  EMPTY_CONNECTION_INPUT,
  validateConnection,
  type ConnectionErrors,
  type ConnectionInput,
  type ConnectionKind,
} from './connections';

type ConnectionFormProps = {
  initial?: ConnectionInput;
  submitLabel: string;
  onSubmit(input: ConnectionInput): void;
  onDelete?(): void;
  /** The trusted host key, when one is saved, with a way to forget it. */
  hostKey?: { fingerprint: string; onForget(): void } | null;
};

const KIND_OPTIONS: { value: ConnectionKind; label: string }[] = [
  { value: 'ssh', label: 'SSH' },
  { value: 'ttyd', label: 'ttyd' },
];

export function ConnectionForm({
  initial = EMPTY_CONNECTION_INPUT,
  submitLabel,
  onSubmit,
  onDelete,
  hostKey,
}: ConnectionFormProps) {
  const theme = useTheme();
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<ConnectionErrors>({});
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const warning = connectionWarning(values);
  const isSsh = values.kind === 'ssh';

  const field = (name: keyof ConnectionInput) => ({
    value: values[name],
    onChangeText: (text: string) => setValues((current) => ({ ...current, [name]: text })),
    error: errors[name],
  });

  function submit() {
    const next = validateConnection(values);
    setErrors(next);
    if (Object.keys(next).length === 0) onSubmit(values);
  }

  return (
    <Screen scroll edges={['left', 'right', 'bottom']} style={styles.screen}>
      <SegmentedControl
        label="Connection type"
        options={KIND_OPTIONS}
        value={values.kind}
        onChange={(kind) => {
          setValues((current) => ({ ...current, kind }));
          setErrors({});
        }}
      />

      {isSsh ? (
        <>
          <TextField
            label="Host"
            placeholder="lexbox, 100.101.102.103 or user@host"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="next"
            monospace
            testID="connection-host"
            {...field('host')}
          />
          <TextField
            label="Username"
            placeholder="Your username on that computer"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
            textContentType="username"
            returnKeyType="next"
            monospace
            testID="connection-username"
            {...field('username')}
          />
          <TextField
            label="Port"
            keyboardType="number-pad"
            returnKeyType="next"
            monospace
            {...field('port')}
          />
        </>
      ) : (
        <>
          <TextField
            label="Address"
            placeholder="https://devbox.tailnet.ts.net or 192.168.1.20:7681"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            textContentType="URL"
            returnKeyType="next"
            monospace
            testID="connection-address"
            {...field('url')}
          />
          {warning ? <Callout tone="warning">{warning}</Callout> : null}
          {secretsSupported ? (
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
          ) : null}
        </>
      )}

      {secretsSupported ? (
        <TextField
          label="Password"
          placeholder={isSsh ? 'Optional: leave empty to be asked each time' : undefined}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="password"
          textContentType="password"
          returnKeyType="done"
          onSubmitEditing={submit}
          {...field('password')}
        />
      ) : null}

      <TextField
        label="Name"
        placeholder="Optional, e.g. Lexbox"
        returnKeyType="done"
        testID="connection-name"
        {...field('name')}
      />

      {!secretsSupported ? (
        <Callout>
          {isSsh
            ? "SSH runs in the Android and iOS apps: browsers can't open SSH connections. You can still save it here."
            : "Browsers can't send a ttyd username and password. Use the Android or iOS app for hosts started with -c, or put ttyd behind a sign-in proxy."}
        </Callout>
      ) : null}

      {isSsh && hostKey ? (
        <Card>
          <View style={styles.inline}>
            <Icon name="key" size={16} color="success" />
            <ThemedText type="smallBold">Trusted host key</ThemedText>
          </View>
          <ThemedText
            type="code"
            selectable
            style={[styles.well, { backgroundColor: theme.backgroundSelected }]}>
            {hostKey.fingerprint}
          </ThemedText>
          <Button
            title="Forget host key"
            variant="secondary"
            size="small"
            onPress={hostKey.onForget}
          />
        </Card>
      ) : null}

      <View style={styles.actions}>
        <Button title={submitLabel} onPress={submit} testID="connection-save" />
        {onDelete ? (
          <Button
            title={confirmingDelete ? 'Tap again to delete' : 'Delete connection'}
            variant="danger"
            onPress={() => (confirmingDelete ? onDelete() : setConfirmingDelete(true))}
          />
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { gap: Spacing.three + 4 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  well: {
    padding: Spacing.three - 4,
    borderRadius: Radius.small + 2,
    overflow: 'hidden',
    fontSize: 12,
  },
  actions: { gap: Spacing.two + 2, marginTop: Spacing.two },
});
