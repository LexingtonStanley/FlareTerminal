import * as Clipboard from 'expo-clipboard';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Callout, Card, Divider, Section } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { TextField } from '@/components/ui/text-field';
import { ToggleRow } from '@/components/ui/toggle-row';
import { Spacing } from '@/constants/theme';
import { useGroups } from '@/features/groups/groups-provider';
import { watchTargets } from '@/features/outbox/outbox-watcher';
import { useSessionManager, useSessions } from '@/features/sessions/sessions-provider';
import { useLock } from '@/features/vault/lock-provider';
import { useProtection } from '@/features/vault/use-protection';

import { importInput, importRows, IMPORT_NOTES, type ImportRow } from './config-import';
import { Chips } from './connection-form';
import type { Connection } from './connections';
import { useConnections } from './connections-provider';
import { readSshConfig } from './read-ssh-config';
import { parseSshConfig, type SshConfig } from './ssh-config';

/** Where the config came from: pasted, or read from a computer Flare is connected to. */
type Source = { kind: 'paste' } | { kind: 'computer'; name: string; config: SshConfig };

const PLACEHOLDER = 'Host lexbox\n  HostName 100.101.102.103\n  User lexde';

/** A host's line in the list: `user@host:port`, as Home shows a connection. */
function rowLabel({ host }: ImportRow, user: string): string {
  const username = host.user ?? user.trim();
  const port = host.port === 22 ? '' : `:${host.port}`;
  return `${username ? `${username}@` : ''}${host.hostName}${port}`;
}

/** Adds the hosts in an OpenSSH config as connections. */
export function ConfigImportForm({
  groupId: initialGroupId = '',
  onImported,
}: {
  groupId?: string;
  onImported(connections: Connection[]): void;
}) {
  const { connections, add } = useConnections();
  const { groups } = useGroups();
  const manager = useSessionManager();
  const sessions = useSessions();
  const { settings, isAuthorized } = useLock();
  const scopeOf = useProtection();
  // A protected connection's host stays behind the lock, as its screen does.
  const computers = watchTargets(sessions, connections).filter(({ connectionId }) => {
    const scope = scopeOf(connectionId);
    return !scope || !settings || isAuthorized(scope);
  });

  const [text, setText] = useState('');
  const [source, setSource] = useState<Source>({ kind: 'paste' });
  const [reading, setReading] = useState<string | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  /** The hosts ticked, by alias; null until the person changes one. */
  const [ticked, setTicked] = useState<Set<string> | null>(null);
  const [user, setUser] = useState('');
  const [userError, setUserError] = useState<string | undefined>();
  const [groupId, setGroupId] = useState(initialGroupId);

  const config = useMemo(
    () => (source.kind === 'computer' ? source.config : parseSshConfig(text)),
    [source, text]
  );
  const rows = useMemo(() => importRows(config.hosts, connections), [config, connections]);
  const isTicked = (row: ImportRow) =>
    row.note !== 'invalid' && (ticked ? ticked.has(row.host.alias) : row.note === null);
  const chosen = rows.filter(isTicked);
  const needUser = chosen.filter((row) => row.host.user === null).length;

  function pasted(next: string) {
    setText(next);
    setSource({ kind: 'paste' });
    setTicked(null);
    setReadError(null);
  }

  async function paste() {
    pasted(await Clipboard.getStringAsync());
  }

  async function readFrom(computer: { sessionId: string; connectionId: string; host: string }) {
    setReading(computer.connectionId);
    setReadError(null);
    try {
      const config = await readSshConfig((command, events) =>
        manager.runCommand(computer.sessionId, command, events)
      );
      if (!config) {
        setReadError(`${computer.host} has no ~/.ssh/config.`);
        return;
      }
      const connection = connections.find(({ id }) => id === computer.connectionId);
      // OpenSSH there signs in as the person's own user when the config names none.
      const username = connection?.kind === 'ssh' ? connection.username : '';
      setSource({ kind: 'computer', name: computer.host, config });
      setText('');
      setTicked(null);
      setUser(username);
    } catch (error) {
      setReadError(`Couldn’t read it from ${computer.host}: ${(error as Error).message}.`);
    } finally {
      setReading(null);
    }
  }

  function toggle(row: ImportRow, on: boolean) {
    const next = new Set(rows.filter(isTicked).map(({ host }) => host.alias));
    if (on) next.add(row.host.alias);
    else next.delete(row.host.alias);
    setTicked(next);
  }

  function submit() {
    if (!chosen.length) return;
    if (needUser && !user.trim()) {
      setUserError('Enter the username for the hosts that don’t name one');
      return;
    }
    onImported(add(chosen.map((row) => importInput(row.host, user, groupId))));
  }

  return (
    <Screen scroll edges={['left', 'right', 'bottom']} style={styles.screen}>
      <ThemedText type="small" themeColor="textSecondary">
        Add the hosts in an SSH config (~/.ssh/config) as connections. Flare reads each Host’s
        HostName, User and Port.
      </ThemedText>

      {computers.length ? (
        <Section title="From a computer you’re connected to">
          <View style={styles.buttons}>
            {computers.map((computer) => (
              <Button
                key={computer.connectionId}
                title={`Read ~/.ssh/config on ${computer.host}`}
                icon="download"
                variant="secondary"
                size="small"
                loading={reading === computer.connectionId}
                disabled={reading !== null}
                onPress={() => readFrom(computer)}
              />
            ))}
          </View>
        </Section>
      ) : null}

      <View style={styles.field}>
        <TextField
          label={computers.length ? 'Or paste it' : 'Paste it'}
          placeholder={PLACEHOLDER}
          multiline
          maxLines={8}
          monospace
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          value={text}
          onChangeText={pasted}
        />
        <Button title="Paste" icon="paste" variant="secondary" size="small" onPress={paste} />
      </View>

      {readError ? <Callout tone="warning">{readError}</Callout> : null}

      {source.kind === 'computer' || text.trim() ? (
        <Section
          title={
            source.kind === 'computer'
              ? `Hosts on ${source.name} · ${rows.length}`
              : `Hosts · ${rows.length}`
          }>
          {rows.length ? (
            <Card flush>
              {rows.map((row, index) => (
                <View key={row.host.alias}>
                  {index > 0 ? <Divider inset={Spacing.three} /> : null}
                  <ToggleRow
                    title={row.host.alias}
                    caption={[rowLabel(row, user), row.note ? IMPORT_NOTES[row.note] : null]
                      .filter(Boolean)
                      .join(' · ')}
                    value={isTicked(row)}
                    disabled={row.note === 'invalid'}
                    onChange={(on) => toggle(row, on)}
                  />
                </View>
              ))}
            </Card>
          ) : (
            <ThemedText type="small" themeColor="textSecondary">
              {source.kind === 'computer'
                ? 'Its config names no hosts, only patterns such as Host *.'
                : 'No hosts yet. Each one starts with a Host line, such as Host lexbox.'}
            </ThemedText>
          )}
        </Section>
      ) : null}

      {config.missing.length ? (
        <Callout>
          {source.kind === 'computer'
            ? `Flare couldn’t follow Include ${config.missing.join(', ')}.`
            : 'Hosts in files named by Include lines aren’t here. Paste those files too, or read the config from a computer you’re connected to.'}
        </Callout>
      ) : null}
      {config.skippedMatch ? (
        <Callout>Match blocks are skipped: they depend on the computer they run on.</Callout>
      ) : null}

      {needUser ? (
        <TextField
          label="Username"
          placeholder="Your username on those computers"
          hint={
            needUser === 1
              ? 'For the host that doesn’t name a User'
              : `For the ${needUser} hosts that don’t name a User`
          }
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username"
          monospace
          value={user}
          onChangeText={(next) => {
            setUser(next);
            setUserError(undefined);
          }}
          error={userError}
        />
      ) : null}

      {chosen.length && groups.length ? (
        <Chips
          label="Group"
          options={[{ id: '', name: 'None' }, ...groups]}
          value={groupId}
          onChange={setGroupId}
        />
      ) : null}

      <Button
        title={
          chosen.length === 1
            ? 'Add 1 connection'
            : chosen.length
              ? `Add ${chosen.length} connections`
              : 'Add connections'
        }
        disabled={!chosen.length}
        onPress={submit}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { gap: Spacing.three + 4 },
  field: { gap: Spacing.two - 2 },
  buttons: { gap: Spacing.two, alignItems: 'flex-start' },
});
