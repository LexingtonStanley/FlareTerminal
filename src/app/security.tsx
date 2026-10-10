import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Callout, Card, Divider, Section } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { TextField } from '@/components/ui/text-field';
import { ToggleRow } from '@/components/ui/toggle-row';
import { Spacing } from '@/constants/theme';
import { useConnections } from '@/features/connections/connections-provider';
import { protectionScope } from '@/features/groups/groups';
import { useGroups } from '@/features/groups/groups-provider';
import { useLock } from '@/features/vault/lock-provider';
import { UnlockPanel } from '@/features/vault/unlock-panel';
import {
  AUTO_LOCK_CHOICES,
  validateLockSecret,
  type AutoLock,
  type LockKind,
} from '@/features/vault/vault';

const KIND_OPTIONS: { value: LockKind; label: string }[] = [
  { value: 'pin', label: 'PIN' },
  { value: 'password', label: 'Password' },
];

const AUTO_LOCK_LABELS: Record<AutoLock, string> = {
  0: 'At once',
  60: '1 min',
  300: '5 min',
  900: '15 min',
};

/** What the screen shows: the settings, a check of the current PIN, or a form for a new one. */
type Step = 'settings' | 'confirm-change' | 'confirm-remove' | 'change';

export default function SecurityScreen() {
  const lock = useLock();
  const [step, setStep] = useState<Step>('settings');

  let content;
  if (!lock.supported) {
    content = (
      <Callout>
        The app lock and the encrypted vault are in the Android and iOS apps. The web version keeps
        no passwords or keys.
      </Callout>
    );
  } else if (!lock.settings) {
    content = <LockForm submitLabel="Turn on app lock" onSubmit={lock.create} />;
  } else if (step === 'change') {
    content = (
      <LockForm
        submitLabel="Save"
        onSubmit={async (kind, secret) => {
          await lock.change(kind, secret);
          setStep('settings');
        }}
      />
    );
  } else if (step === 'confirm-change' || step === 'confirm-remove') {
    content = (
      <>
        <UnlockPanel
          title={step === 'confirm-change' ? 'Change the lock' : 'Turn off the lock'}
          message="First, confirm it's you."
          onUnlocked={() => (step === 'confirm-change' ? setStep('change') : void lock.remove())}
        />
        <Button title="Cancel" variant="ghost" onPress={() => setStep('settings')} />
      </>
    );
  } else {
    content = (
      <LockSettingsView
        onChange={() => setStep('confirm-change')}
        onRemove={() => setStep('confirm-remove')}
      />
    );
  }

  return (
    <Screen scroll edges={['left', 'right', 'bottom']} style={styles.screen}>
      {content}
    </Screen>
  );
}

function LockForm({
  submitLabel,
  onSubmit,
}: {
  submitLabel: string;
  onSubmit(kind: LockKind, secret: string): Promise<void>;
}) {
  const [kind, setKind] = useState<LockKind>('pin');
  const [secret, setSecret] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ secret?: string; confirm?: string }>({});
  const [busy, setBusy] = useState(false);
  const noun = kind === 'pin' ? 'PIN' : 'password';

  async function submit() {
    const secretError = validateLockSecret(kind, secret) ?? undefined;
    const confirmError =
      !secretError && confirm !== secret ? `The ${noun}s don't match` : undefined;
    setErrors({ secret: secretError, confirm: confirmError });
    if (secretError || confirmError) return;
    setBusy(true);
    await onSubmit(kind, secret);
    setBusy(false);
  }

  const secure = {
    secureTextEntry: true,
    autoCapitalize: 'none',
    autoCorrect: false,
    keyboardType: kind === 'pin' ? 'number-pad' : 'default',
    monospace: kind === 'pin',
  } as const;

  return (
    <>
      <ThemedText type="small" themeColor="textSecondary">
        Asked when Flare opens and when it comes back after a while, and before protected
        connections and groups. Your passwords and keys are encrypted with it on this phone.
      </ThemedText>
      <SegmentedControl
        label="Lock type"
        options={KIND_OPTIONS}
        value={kind}
        onChange={(next) => {
          setKind(next);
          setErrors({});
        }}
      />
      <TextField
        label={`New ${noun}`}
        value={secret}
        onChangeText={setSecret}
        error={errors.secret}
        hint={kind === 'pin' ? 'At least 6 digits' : 'At least 8 characters'}
        returnKeyType="next"
        {...secure}
      />
      <TextField
        label={`Repeat the ${noun}`}
        value={confirm}
        onChangeText={setConfirm}
        error={errors.confirm}
        returnKeyType="done"
        onSubmitEditing={submit}
        {...secure}
      />
      <Callout>
        A password is much harder to guess than a PIN if someone copies the phone&apos;s storage.
        Forget it and the saved passwords and keys are gone: you would set them up again.
      </Callout>
      <Button title={submitLabel} onPress={submit} loading={busy} />
    </>
  );
}

function LockSettingsView({ onChange, onRemove }: { onChange(): void; onRemove(): void }) {
  const lock = useLock();
  const { connections } = useConnections();
  const { groups } = useGroups();
  const settings = lock.settings!;
  const protectedCount = connections.filter((connection) =>
    protectionScope(connection, groups)
  ).length;

  return (
    <>
      <Section title="Unlock">
        <Card flush>
          <View style={styles.row}>
            <ThemedText type="smallBold" style={styles.grow}>
              {settings.kind === 'pin' ? 'PIN' : 'Password'}
            </ThemedText>
            <Button title="Change" variant="ghost" size="small" onPress={onChange} />
          </View>
          {lock.biometricsAvailable ? (
            <>
              <Divider inset={Spacing.three} />
              <ToggleRow
                title="Unlock with biometrics"
                caption="Face ID, Touch ID or a fingerprint, with the PIN as a fallback"
                value={settings.biometrics}
                onChange={(on) => void lock.setBiometrics(on)}
              />
            </>
          ) : null}
        </Card>
      </Section>

      <Section title="Lock after leaving Flare">
        <SegmentedControl
          label="Lock after leaving Flare"
          options={AUTO_LOCK_CHOICES.map((value) => ({
            value: String(value),
            label: AUTO_LOCK_LABELS[value],
          }))}
          value={String(settings.autoLock)}
          onChange={(value) => lock.setAutoLock(Number(value) as AutoLock)}
        />
        <ThemedText type="caption" themeColor="textSecondary">
          Sessions keep running while Flare is locked.
        </ThemedText>
        <Card flush>
          <ToggleRow
            title="Forget the key when locked"
            caption="Passwords and keys stay sealed until you unlock. A session that drops meanwhile reconnects after."
            value={settings.forgetKey}
            onChange={lock.setForgetKey}
          />
        </Card>
      </Section>

      <View style={styles.actions}>
        <Button title="Lock now" icon="lock" variant="secondary" onPress={lock.lockNow} />
        {protectedCount ? (
          <Callout tone="warning">
            {protectedCount === 1
              ? '1 protected connection opens without unlocking if you turn the lock off.'
              : `${protectedCount} protected connections open without unlocking if you turn the lock off.`}
          </Callout>
        ) : null}
        <Button title="Turn off app lock" variant="danger" onPress={onRemove} />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { gap: Spacing.four },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    paddingLeft: Spacing.three,
    paddingRight: Spacing.two,
  },
  grow: { flex: 1 },
  actions: { gap: Spacing.two + 2 },
});
