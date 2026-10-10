import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Callout, Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Screen } from '@/components/ui/screen';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { TextField } from '@/components/ui/text-field';
import { ToggleRow } from '@/components/ui/toggle-row';
import { Spacing } from '@/constants/theme';
import { connectionLabel, type Connection } from '@/features/connections/connections';
import { useShape, useTheme, useType } from '@/hooks/use-theme';

import {
  agentSessionName,
  HARNESSES,
  SESSIONS,
  type AgentHarness,
  type AgentSession,
  type AgentSetup,
} from './agent-command';
import {
  AGENTS_GROUP,
  DEFAULT_AGENT,
  generatedCommand,
  looksDestructive,
  sameGroup,
  SHORTCUT_PRESETS,
  startupCommand,
  validateShortcut,
  withGeneratedCommand,
  type ShortcutAgent,
  type ShortcutErrors,
  type ShortcutInput,
} from './shortcuts';

type Kind = 'agent' | 'command';

const KIND_OPTIONS: { value: Kind; label: string }[] = [
  { value: 'agent', label: 'Agent' },
  { value: 'command', label: 'Command' },
];

const HARNESS_OPTIONS = (Object.keys(HARNESSES) as AgentHarness[]).map((value) => ({
  value,
  label: HARNESSES[value].label,
}));

const SESSION_OPTIONS = (Object.keys(SESSIONS) as AgentSession[]).map((value) => ({
  value,
  label: SESSIONS[value].label,
}));

type ShortcutFormProps = {
  connections: Connection[];
  /** Groups to offer under the group field: those in use, then suggestions. */
  groups: string[];
  initial: ShortcutInput;
  onSubmit(input: ShortcutInput): void;
  onDelete?(): void;
};

/**
 * A shortcut is an agent (folder, name, which agent, which session, the command made from
 * them, editable) or any command. The fields of the kind not shown are kept, so switching
 * back and forth loses nothing.
 */
export function ShortcutForm({
  connections,
  groups,
  initial,
  onSubmit,
  onDelete,
}: ShortcutFormProps) {
  const [values, setValues] = useState<ShortcutInput>(() => ({
    ...initial,
    // One connection: nothing to choose.
    connectionId: initial.connectionId || (connections.length === 1 ? connections[0].id : ''),
  }));
  // The other kind's setup and command, while it isn't shown.
  const [hidden, setHidden] = useState<{ agent: ShortcutAgent; command: string }>(() => ({
    agent: initial.agent ?? DEFAULT_AGENT,
    command: '',
  }));
  const [errors, setErrors] = useState<ShortcutErrors>({});
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // "Ask before running" follows the command (on for a restart) until the person sets it.
  const [confirmSet, setConfirmSet] = useState(
    () => !initial.agent && initial.confirm !== looksDestructive(initial.command)
  );
  const confirm = confirmSet ? values.confirm : looksDestructive(values.command);
  const { agent } = values;

  /** Changes fields; an agent's command follows unless it was edited by hand. */
  const update = (changes: Partial<ShortcutInput>) =>
    setValues((current) => withGeneratedCommand({ ...current, ...changes }));
  const updateAgent = (changes: Partial<AgentSetup>) =>
    setValues((current) =>
      current.agent
        ? withGeneratedCommand({ ...current, agent: { ...current.agent, ...changes } })
        : current
    );
  const field = (name: 'name' | 'directory' | 'group') => ({
    value: values[name],
    onChangeText: (text: string) => update({ [name]: text }),
    error: errors[name],
  });

  function editCommand(command: string) {
    setValues((current) =>
      current.agent
        ? {
            ...current,
            command,
            // Typed back to what the setup makes, it follows the setup again.
            agent: { ...current.agent, commandEdited: command !== generatedCommand(current) },
          }
        : { ...current, command }
    );
  }

  function resetCommand() {
    setValues((current) =>
      current.agent
        ? withGeneratedCommand({ ...current, agent: { ...current.agent, commandEdited: false } })
        : current
    );
  }

  function switchKind(kind: Kind) {
    if ((kind === 'agent') === !!values.agent) return;
    setErrors({});
    setHidden({ agent: values.agent ?? hidden.agent, command: values.command });
    if (values.agent) {
      setValues({
        ...values,
        agent: null,
        command: hidden.command,
        group: sameGroup(values.group, AGENTS_GROUP) ? '' : values.group,
      });
    } else {
      setValues(
        withGeneratedCommand({
          ...values,
          agent: hidden.agent,
          command: hidden.command,
          group: values.group.trim() ? values.group : AGENTS_GROUP,
        })
      );
    }
  }

  function submit() {
    const input = { ...values, confirm };
    const next = validateShortcut(input);
    setErrors(next);
    if (Object.keys(next).length === 0) onSubmit(input);
  }

  return (
    <Screen scroll edges={['left', 'right', 'bottom']} style={styles.screen}>
      <SegmentedControl
        label="Shortcut type"
        options={KIND_OPTIONS}
        value={agent ? 'agent' : 'command'}
        onChange={switchKind}
      />

      {agent ? (
        <>
          <TextField
            label="Folder"
            placeholder="~/agents/janus"
            hint="Where the agent works (optional)"
            autoCapitalize="none"
            autoCorrect={false}
            monospace
            {...field('directory')}
          />
          <TextField
            label="Name"
            placeholder="Janus"
            hint={
              agent.session === 'none'
                ? undefined
                : `Also the name of its ${SESSIONS[agent.session].label} session`
            }
            autoCorrect={false}
            {...field('name')}
          />
          <Labelled label="Coding agent">
            <HarnessPicker value={agent.harness} onChange={(harness) => updateAgent({ harness })} />
          </Labelled>
          <Labelled
            label="Session"
            hint={
              agent.session === 'none'
                ? 'Without one, the agent stops when the connection drops.'
                : 'tmux and zellij keep the agent running when the phone disconnects; the next tap reattaches.'
            }>
            <SegmentedControl
              label="Session"
              options={SESSION_OPTIONS}
              value={agent.session}
              onChange={(session) => updateAgent({ session })}
            />
          </Labelled>
          <PermissionsToggle
            harness={agent.harness}
            value={agent.skipPermissions}
            onChange={(skipPermissions) => updateAgent({ skipPermissions })}
          />
          {HARNESSES[agent.harness].worktreeFlag ? (
            <FlagToggle
              title="Work in its own git worktree"
              flag={`${HARNESSES[agent.harness].worktreeFlag} ${agentSessionName(values.name, agent.harness)}`}
              hint="Its own branch and folder, so it can work beside other agents in the same git repository"
              value={agent.worktree === true}
              onChange={(worktree) => updateAgent({ worktree })}
            />
          ) : null}
        </>
      ) : (
        <>
          <Labelled label="Start from">
            <ScrollView
              horizontal
              keyboardShouldPersistTaps="handled"
              showsHorizontalScrollIndicator={false}
              style={styles.bleed}
              contentContainerStyle={styles.chips}>
              {SHORTCUT_PRESETS.map((preset) => (
                <Chip
                  key={preset.label}
                  role="button"
                  label={preset.label}
                  accessibleName={`Use ${preset.label}`}
                  selected={values.command === preset.command}
                  onPress={() =>
                    update({ command: preset.command, name: values.name || preset.name })
                  }
                />
              ))}
            </ScrollView>
          </Labelled>
          <TextField label="Name" placeholder="Disk space" {...field('name')} />
        </>
      )}

      <ConnectionPicker
        connections={connections}
        value={values.connectionId}
        error={errors.connectionId}
        onChange={(connectionId) => update({ connectionId })}
      />

      {agent ? null : (
        <>
          <TextField
            label="Command"
            placeholder="df -h"
            autoCapitalize="none"
            autoCorrect={false}
            monospace
            value={values.command}
            onChangeText={editCommand}
            error={errors.command}
          />
          <TextField
            label="Folder"
            placeholder="Optional, e.g. ~/code/my-app"
            autoCapitalize="none"
            autoCorrect={false}
            monospace
            {...field('directory')}
          />
          <Card flush>
            <ToggleRow
              title="Ask before running"
              caption="Home checks with you first. For restarts, deletes and reboots."
              value={confirm}
              onChange={(on) => {
                setConfirmSet(true);
                setValues((current) => ({ ...current, confirm: on }));
              }}
            />
          </Card>
        </>
      )}

      <View style={styles.group}>
        <TextField
          label="Group"
          placeholder="Optional: a heading on Home"
          autoCorrect={false}
          {...field('group')}
        />
        <ScrollView
          horizontal
          keyboardShouldPersistTaps="handled"
          showsHorizontalScrollIndicator={false}
          style={styles.bleed}
          contentContainerStyle={styles.chips}>
          <View role="radiogroup" aria-label="Groups" style={styles.row}>
            {groups.map((group) => (
              <Chip
                key={group}
                role="radio"
                label={group}
                selected={sameGroup(values.group, group)}
                onPress={() => update({ group })}
              />
            ))}
          </View>
        </ScrollView>
      </View>

      {agent ? (
        <View style={styles.group}>
          <TextField
            label="Command"
            multiline
            submitBehavior="blurAndSubmit"
            returnKeyType="done"
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            monospace
            value={values.command}
            onChangeText={editCommand}
            error={errors.command}
            hint={
              agent.commandEdited
                ? 'Edited by hand, so the choices above no longer change it.'
                : 'Made from the choices above, and yours to edit. Typed into your shell on connect (bash or zsh syntax).'
            }
          />
          {agent.commandEdited ? (
            <View style={styles.start}>
              <Button
                title="Use the generated command"
                icon="reconnect"
                variant="secondary"
                size="small"
                onPress={resetCommand}
              />
            </View>
          ) : null}
        </View>
      ) : values.command.trim() ? (
        <Labelled label="Runs">
          <CommandPreview command={startupCommand(values)} />
        </Labelled>
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
  );
}

/** A field's label over something that isn't a text field, with an optional note under it. */
function Labelled({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.group}>
      <ThemedText type="eyebrow" themeColor="textSecondary">
        {label}
      </ThemedText>
      {children}
      {hint ? (
        <ThemedText type="caption" themeColor="textSecondary">
          {hint}
        </ThemedText>
      ) : null}
    </View>
  );
}

type ChipProps = {
  label: string;
  /** Defaults to the label. */
  accessibleName?: string;
  role: 'radio' | 'button';
  selected: boolean;
  onPress(): void;
};

function Chip({ label, accessibleName, role, selected, onPress }: ChipProps) {
  const theme = useTheme();
  const shape = useShape();
  const { sans } = useType();
  return (
    <Pressable
      role={role}
      aria-checked={role === 'radio' ? selected : undefined}
      aria-label={accessibleName ?? label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected
            ? theme.primaryMuted
            : pressed
              ? theme.backgroundSelected
              : theme.backgroundElement,
          borderColor: selected ? theme.primary : theme.border,
          borderRadius: shape.radius.pill,
          borderWidth: Math.max(1, shape.borderWidth),
        },
      ]}>
      <ThemedText type="small" themeColor={selected ? 'primaryText' : 'text'} style={sans(500)}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

/** The coding agents, two by two, each with the program it runs. */
function HarnessPicker({
  value,
  onChange,
}: {
  value: AgentHarness;
  onChange(harness: AgentHarness): void;
}) {
  const theme = useTheme();
  const shape = useShape();
  return (
    <View role="radiogroup" aria-label="Coding agent" style={styles.wrap}>
      {HARNESS_OPTIONS.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            role="radio"
            aria-checked={selected}
            aria-label={option.label}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              styles.harness,
              {
                backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement,
                borderColor: selected ? theme.primary : theme.border,
                borderRadius: shape.radius.medium,
                borderWidth: shape.borderWidthStrong,
              },
            ]}>
            <ThemedText type="smallBold" numberOfLines={1}>
              {option.label}
            </ThemedText>
            <ThemedText type="code" themeColor="textSecondary" numberOfLines={1}>
              {HARNESSES[option.value].program}
            </ThemedText>
            {selected ? (
              <View
                style={[
                  styles.check,
                  { backgroundColor: theme.primary, borderRadius: Math.min(shape.radius.dot, 9) },
                ]}>
                <Icon name="check" size={12} color="onPrimary" weight="bold" />
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/** The harness's flag for running without permission prompts, as a switch. */
function PermissionsToggle({
  harness,
  value,
  onChange,
}: {
  harness: AgentHarness;
  value: boolean;
  onChange(value: boolean): void;
}) {
  const { label, skipFlag } = HARNESSES[harness];
  if (!skipFlag) {
    return <Callout>{`${label} doesn’t ask for permission, so there’s nothing to skip.`}</Callout>;
  }
  return (
    <FlagToggle title="Skip permission prompts" flag={skipFlag} value={value} onChange={onChange} />
  );
}

/** A switch that adds a flag to the agent's command, showing the flag. */
function FlagToggle({
  title,
  flag,
  hint,
  value,
  onChange,
}: {
  title: string;
  flag: string;
  /** What it does, under the flag. */
  hint?: string;
  value: boolean;
  onChange(value: boolean): void;
}) {
  const theme = useTheme();
  const shape = useShape();

  return (
    <Pressable
      role="switch"
      aria-checked={value}
      aria-label={title}
      onPress={() => onChange(!value)}
      style={({ pressed }) => [
        styles.box,
        styles.toggle,
        {
          backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement,
          borderColor: theme.border,
          borderRadius: shape.radius.medium,
          borderWidth: Math.max(1, shape.borderWidth),
        },
      ]}>
      <View style={styles.toggleText}>
        <ThemedText type="smallBold">{title}</ThemedText>
        <ThemedText type="code" themeColor="textSecondary">
          {flag}
        </ThemedText>
        {hint ? (
          <ThemedText type="caption" themeColor="textSecondary">
            {hint}
          </ThemedText>
        ) : null}
      </View>
      <View
        style={[
          styles.track,
          {
            borderRadius: shape.radius.pill,
            backgroundColor: value ? theme.primary : theme.backgroundSelected,
            borderColor: value ? theme.primary : theme.textSecondary,
          },
        ]}>
        <View
          style={[
            value ? styles.thumbOn : styles.thumbOff,
            {
              backgroundColor: value ? theme.onPrimary : theme.textSecondary,
              borderRadius: Math.min(shape.radius.pill, value ? 10 : 7),
            },
          ]}
        />
      </View>
    </Pressable>
  );
}

function ConnectionPicker({
  connections,
  value,
  error,
  onChange,
}: {
  connections: Connection[];
  value: string;
  error?: string;
  onChange(id: string): void;
}) {
  const theme = useTheme();
  const shape = useShape();
  return (
    <View style={styles.group}>
      <ThemedText type="eyebrow" themeColor="textSecondary">
        Connection
      </ThemedText>
      <View
        role="radiogroup"
        aria-label="Connection"
        style={[
          styles.box,
          {
            backgroundColor: theme.backgroundElement,
            borderColor: error ? theme.danger : theme.border,
            borderRadius: shape.radius.medium,
            borderWidth: Math.max(1, shape.borderWidth),
          },
        ]}>
        {connections.map((connection, index) => {
          const selected = value === connection.id;
          return (
            <Pressable
              key={connection.id}
              role="radio"
              aria-checked={selected}
              aria-label={connection.name}
              onPress={() => onChange(connection.id)}
              style={({ pressed }) => [
                styles.option,
                index > 0 && { borderTopColor: theme.border, borderTopWidth: shape.hairline },
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
      {error ? (
        <View style={styles.message}>
          <Icon name="error" size={15} color="danger" />
          <ThemedText type="small" themeColor="danger">
            {error}
          </ThemedText>
        </View>
      ) : null}
    </View>
  );
}

function CommandPreview({ command }: { command: string }) {
  const theme = useTheme();
  const shape = useShape();
  return (
    <View
      style={[
        styles.preview,
        {
          backgroundColor: theme.backgroundSelected,
          borderColor: theme.border,
          borderRadius: shape.radius.medium,
          borderWidth: shape.hairline,
        },
      ]}>
      <ThemedText type="code" themeColor="primary">
        $
      </ThemedText>
      <ThemedText type="code" selectable style={styles.previewCommand}>
        {command}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { gap: Spacing.three + 4 },
  group: { gap: Spacing.two - 2 },
  start: { alignSelf: 'flex-start' },
  // The chips scroll to the screen's edges.
  bleed: { marginHorizontal: -Spacing.four, flexGrow: 0 },
  chips: { flexDirection: 'row', gap: Spacing.two, paddingHorizontal: Spacing.four },
  row: { flexDirection: 'row', gap: Spacing.two },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: Spacing.three - 2,
  },
  harness: {
    flexBasis: '40%',
    flexGrow: 1,
    gap: Spacing.half,
    paddingHorizontal: Spacing.three - 4,
    paddingVertical: Spacing.two + 2,
  },
  check: {
    position: 'absolute',
    top: Spacing.two,
    right: Spacing.two,
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  box: { overflow: 'hidden' },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three - 4,
    paddingHorizontal: Spacing.three - 2,
    paddingVertical: Spacing.three - 4,
  },
  toggleText: { flex: 1, gap: Spacing.half },
  track: {
    width: 46,
    height: 28,
    borderWidth: 1.5,
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  thumbOn: { width: 20, height: 20, alignSelf: 'flex-end' },
  thumbOff: { width: 14, height: 14, marginLeft: 3 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three - 4,
    paddingHorizontal: Spacing.three - 2,
    paddingVertical: Spacing.three - 4,
  },
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
  },
  previewCommand: { flex: 1 },
  actions: { gap: Spacing.two + 2, marginTop: Spacing.two },
});
