import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Callout, Card, Divider, Section } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Screen } from '@/components/ui/screen';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { TextField } from '@/components/ui/text-field';
import { ToggleRow } from '@/components/ui/toggle-row';
import { Radius, sans, Spacing } from '@/constants/theme';
import { useGroups } from '@/features/groups/groups-provider';
import { useLock } from '@/features/vault/lock-provider';
import { useTheme } from '@/hooks/use-theme';
import { secretsSupported } from '@/lib/secrets';

import {
  connectionWarning,
  EMPTY_CONNECTION_INPUT,
  validateConnection,
  type ConnectionErrors,
  type ConnectionInput,
  type ConnectionKind,
  type ConnectionTextField,
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

  const { groups } = useGroups();
  const lock = useLock();
  const group = groups.find(({ id }) => id === values.groupId);

  const field = (name: ConnectionTextField) => ({
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

      {groups.length ? (
        <View style={styles.field}>
          <ThemedText type="eyebrow" themeColor="textSecondary">
            Group
          </ThemedText>
          <View role="radiogroup" aria-label="Group" style={styles.chips}>
            {[{ id: '', name: 'None' }, ...groups].map((option) => {
              const selected = option.id === values.groupId;
              return (
                <Pressable
                  key={option.id}
                  role="radio"
                  aria-checked={selected}
                  aria-label={option.name}
                  onPress={() => setValues((current) => ({ ...current, groupId: option.id }))}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: selected ? theme.primaryMuted : theme.backgroundElement,
                      borderColor: selected ? theme.primary : theme.border,
                    },
                  ]}>
                  <Text style={[styles.chipText, { color: selected ? theme.primary : theme.text }]}>
                    {option.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      <Section title="Access">
        <Card flush>
          <ToggleRow
            title="Require unlock"
            caption={
              group?.protected
                ? `Its group, ${group.name}, already asks for the app lock`
                : lock.settings
                  ? 'Ask for the app lock each time you come back to it'
                  : lock.supported
                    ? 'Turn on the app lock in Settings first'
                    : 'Needs the app lock in the Android and iOS apps'
            }
            value={values.protected || group?.protected === true}
            disabled={!lock.settings || group?.protected === true}
            onChange={(on) => setValues((current) => ({ ...current, protected: on }))}
          />
          <Divider inset={Spacing.three} />
          <ToggleRow
            title="Stay connected when you leave"
            caption={
              values.keepAlive
                ? 'Sessions keep running in the background'
                : 'Sessions disconnect when you leave them or the app'
            }
            value={values.keepAlive}
            onChange={(on) => setValues((current) => ({ ...current, keepAlive: on }))}
          />
        </Card>
      </Section>

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
  field: { gap: Spacing.two - 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipText: { ...sans(600), fontSize: 14 },
});
