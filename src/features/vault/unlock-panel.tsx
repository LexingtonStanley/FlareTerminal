import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { useShape, useTheme } from '@/hooks/use-theme';

import { useLock } from './lock-provider';

type UnlockPanelProps = {
  title: string;
  /** What unlocking opens, under the title. */
  message?: string;
  /** Called after a successful unlock. */
  onUnlocked?(): void;
  /** Ask for biometrics as soon as the panel shows, when they are turned on. */
  autoBiometrics?: boolean;
};

function waitMessage(retryAt: number) {
  const seconds = Math.max(1, Math.ceil((retryAt - Date.now()) / 1000));
  return seconds < 120
    ? `Too many tries. Try again in ${seconds} seconds.`
    : `Too many tries. Try again in ${Math.ceil(seconds / 60)} minutes.`;
}

/** Asks for the app lock's PIN or password, or biometrics. Used by the lock screen and gates. */
export function UnlockPanel({
  title,
  message,
  onUnlocked,
  autoBiometrics = false,
}: UnlockPanelProps) {
  const { settings, unlock, unlockWithBiometrics } = useLock();
  const theme = useTheme();
  const { radius } = useShape();
  const [secret, setSecret] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const isPin = settings?.kind !== 'password';
  const label = isPin ? 'PIN' : 'Password';
  const biometrics = settings?.biometrics === true;

  async function tryBiometrics() {
    if (await unlockWithBiometrics()) onUnlocked?.();
  }

  useEffect(() => {
    if (autoBiometrics && biometrics) void tryBiometrics();
    // Once, when the panel first shows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit() {
    if (!secret || busy) return;
    setBusy(true);
    const result = await unlock(secret);
    setBusy(false);
    setSecret('');
    if (result.ok) {
      setError(undefined);
      onUnlocked?.();
    } else {
      setError(
        result.retryAt ? waitMessage(result.retryAt) : `Wrong ${isPin ? 'PIN' : 'password'}`
      );
    }
  }

  return (
    <View style={styles.panel}>
      <View
        style={[styles.badge, { backgroundColor: theme.primaryMuted, borderRadius: radius.pill }]}>
        <Icon name="lock" size={22} color="primaryText" />
      </View>
      <View style={styles.heading}>
        <ThemedText type="subtitle" role="heading" style={styles.center}>
          {title}
        </ThemedText>
        {message ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
            {message}
          </ThemedText>
        ) : null}
      </View>
      <TextField
        label={label}
        value={secret}
        onChangeText={setSecret}
        error={error}
        secureTextEntry
        autoFocus={!biometrics}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType={isPin ? 'number-pad' : 'default'}
        returnKeyType="done"
        onSubmitEditing={submit}
        monospace={isPin}
      />
      <Button title="Unlock" onPress={submit} loading={busy} disabled={!secret} />
      {biometrics ? (
        <Button
          title="Unlock with biometrics"
          icon="biometrics"
          variant="ghost"
          onPress={() => void tryBiometrics()}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: Spacing.three, alignItems: 'stretch' },
  badge: {
    alignSelf: 'center',
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heading: { gap: Spacing.one },
  center: { textAlign: 'center' },
});
