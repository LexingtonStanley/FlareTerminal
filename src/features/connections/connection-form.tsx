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
import { Spacing } from '@/constants/theme';
import { protectionScope } from '@/features/groups/groups';
import { useGroups } from '@/features/groups/groups-provider';
import { NO_KEY } from '@/features/ssh/keys';
import { useKeys } from '@/features/ssh/keys-provider';
import { useLock } from '@/features/vault/lock-provider';
import { useShape, useTheme, useType } from '@/hooks/use-theme';
import { secretsSupported } from '@/lib/secrets';

import {
  connectionWarning,
  EMPTY_CONNECTION_INPUT,
  jumpChoices,
  validateConnection,
  type ConnectionErrors,
  type ConnectionInput,
  type ConnectionKind,
  type ConnectionTextField,
} from './connections';
import { useConnections } from './connections-provider';

type ConnectionFormProps = {
  /** The saved connection being edited, if it is one. */
  connectionId?: string;
  initial?: ConnectionInput;
  submitLabel: string;
  onSubmit(input: ConnectionInput): void;
  onDelete?(): void;
  /** The trusted host key, when one is saved, with a way to forget it. */
  hostKey?: { fingerprint: string; onForget(): void } | null;
  /** Offers to add the hosts in an SSH config instead (a new connection). */
  onImport?(): void;
};

const KIND_OPTIONS: { value: ConnectionKind; label: string }[] = [
  { value: 'ssh', label: 'SSH' },
  { value: 'ttyd', label: 'ttyd' },
];

export function ConnectionForm({
  connectionId,
  initial = EMPTY_CONNECTION_INPUT,
  submitLabel,
  onSubmit,
  onDelete,
  hostKey,
  onImport,
}: ConnectionFormProps) {
  const theme = useTheme();
  const { radius } = useShape();
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<ConnectionErrors>({});
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const warning = connectionWarning(values);
  const isSsh = values.kind === 'ssh';

  const { groups } = useGroups();
  const { keys } = useKeys();
  const { connections } = useConnections();
  const lock = useLock();
  const group = groups.find(({ id }) => id === values.groupId);
  const jumps = jumpChoices(connectionId ?? null, connections);
  const jump = isSsh ? jumps.find(({ id }) => id === values.jumpId) : undefined;
  // Its sessions sign in to the jump host with that one's credentials, so its lock applies.
  const jumpLocked = jump && protectionScope(jump, groups, connections) ? jump : null;
  const jumpedBy = connections.filter(
    (other) => other.kind === 'ssh' && connectionId && other.jumpId === connectionId
  );
  // A deleted key leaves the connection offering every key.
  const keyChoice =
    values.keyId === NO_KEY || keys.some(({ id }) => id === values.keyId) ? values.keyId : '';

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
      {onImport ? (
        <Card style={styles.import}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.grow}>
            Have hosts in ~/.ssh/config?
          </ThemedText>
          <Button
            title="Import"
            label="Import from SSH config"
            icon="download"
            variant="secondary"
            size="small"
            onPress={onImport}
          />
        </Card>
      ) : null}

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

      {isSsh && secretsSupported && keys.length ? (
        <View style={styles.field}>
          <Chips
            label="SSH key"
            options={[
              { id: '', name: 'Any key' },
              ...keys.map(({ id, name }) => ({ id, name })),
              { id: NO_KEY, name: 'None' },
            ]}
            value={keyChoice}
            onChange={(keyId) => setValues((current) => ({ ...current, keyId }))}
          />
          <ThemedText type="caption" themeColor="textSecondary">
            {keyChoice === ''
              ? 'Offers each of your keys, then the password'
              : keyChoice === NO_KEY
                ? 'Signs in with the password only'
                : 'Offers only this key, then the password'}
          </ThemedText>
        </View>
      ) : null}

      {isSsh && (jumps.length || values.jumpId) ? (
        <View style={styles.field}>
          <Chips
            label="Jump host"
            options={[{ id: '', name: 'None' }, ...jumps.map(({ id, name }) => ({ id, name }))]}
            value={values.jumpId}
            onChange={(jumpId) => setValues((current) => ({ ...current, jumpId }))}
          />
          <ThemedText type="caption" themeColor="textSecondary">
            {!values.jumpId
              ? 'Connects to it directly'
              : jump
                ? `Connects to ${jump.name} first, then from there to the host above, like ssh -J`
                : 'Its jump host was deleted. Choose another, or None to connect directly.'}
          </ThemedText>
        </View>
      ) : null}

      {groups.length ? (
        <Chips
          label="Group"
          options={[{ id: '', name: 'None' }, ...groups]}
          value={values.groupId}
          onChange={(groupId) => setValues((current) => ({ ...current, groupId }))}
        />
      ) : null}

      <Section title="Access">
        <Card flush>
          <ToggleRow
            title="Require unlock"
            caption={
              group?.protected
                ? `Its group, ${group.name}, already asks for the app lock`
                : jumpLocked
                  ? `Its jump host, ${jumpLocked.name}, already asks for the app lock`
                  : lock.settings
                    ? 'Ask for the app lock each time you come back to it'
                    : lock.supported
                      ? 'Turn on the app lock in Settings first'
                      : 'Needs the app lock in the Android and iOS apps'
            }
            value={values.protected || group?.protected === true || !!jumpLocked}
            disabled={!lock.settings || group?.protected === true || !!jumpLocked}
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
          {isSsh ? (
            <>
              <Divider inset={Spacing.three} />
              <ToggleRow
                title="Forward SSH agent"
                caption={
                  !secretsSupported
                    ? 'Needs your SSH keys, in the Android and iOS apps'
                    : values.forwardAgent
                      ? 'Commands there, like git push, can ask to use your keys. Flare asks you each time.'
                      : keys.length
                        ? 'Lets commands there, like git push, ask to use your keys, like ssh -A'
                        : 'Make or import an SSH key in Settings first'
                }
                value={values.forwardAgent}
                disabled={!values.forwardAgent && (!secretsSupported || !keys.length)}
                onChange={(on) => setValues((current) => ({ ...current, forwardAgent: on }))}
              />
            </>
          ) : null}
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
            style={[
              styles.well,
              {
                backgroundColor: theme.backgroundSelected,
                borderRadius: Math.min(radius.small + 2, radius.small * 2),
              },
            ]}>
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

      {confirmingDelete && jumpedBy.length ? (
        <Callout tone="warning">
          {jumpedBy.length === 1
            ? `${jumpedBy[0].name} goes through this connection, and won’t connect until you choose another jump host for it.`
            : `${jumpedBy.length} connections go through this one, and won’t connect until you choose another jump host for them.`}
        </Callout>
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

/** One choice from a few named options, as a row of chips. */
export function Chips({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { id: string; name: string }[];
  value: string;
  onChange(id: string): void;
}) {
  const theme = useTheme();
  const shape = useShape();
  const { sans } = useType();
  return (
    <View style={styles.field}>
      <ThemedText type="eyebrow" themeColor="textSecondary">
        {label}
      </ThemedText>
      <View role="radiogroup" aria-label={label} style={styles.chips}>
        {options.map((option) => {
          const selected = option.id === value;
          return (
            <Pressable
              key={option.id}
              role="radio"
              aria-checked={selected}
              aria-label={option.name}
              onPress={() => onChange(option.id)}
              style={[
                styles.chip,
                {
                  backgroundColor: selected ? theme.primaryMuted : theme.backgroundElement,
                  borderColor: selected ? theme.primary : theme.border,
                  borderRadius: shape.radius.pill,
                  borderWidth: shape.hairline,
                },
              ]}>
              <Text
                style={[
                  styles.chipText,
                  sans(600),
                  { color: selected ? theme.primaryText : theme.text },
                ]}>
                {option.name}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { gap: Spacing.three + 4 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  well: {
    padding: Spacing.three - 4,
    overflow: 'hidden',
    fontSize: 12,
  },
  actions: { gap: Spacing.two + 2, marginTop: Spacing.two },
  import: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  grow: { flex: 1 },
  field: { gap: Spacing.two - 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
  },
  chipText: { fontSize: 14 },
});
