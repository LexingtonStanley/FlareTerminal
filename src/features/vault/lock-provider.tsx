import { createContext, use, useEffect, useState, type PropsWithChildren } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';

import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/ui/icon';
import { mono, Spacing } from '@/constants/theme';
import { passwordKey } from '@/features/connections/connections';
import { useConnections } from '@/features/connections/connections-provider';
import { APP_KEY_SECRET } from '@/features/ssh/app-key';
import { useTheme } from '@/hooks/use-theme';
import { biometricsSupported, secretsSupported } from '@/lib/secrets';

import { UnlockPanel } from './unlock-panel';
import { Vault, type AutoLock, type LockKind, type LockSettings, type UnlockResult } from './vault';

type LockContextValue = {
  /** False on the web, which has nowhere safe to keep the vault. */
  supported: boolean;
  /** The lock's settings, or null when there is no app lock. */
  settings: LockSettings | null;
  /** The lock screen is up. */
  locked: boolean;
  biometricsAvailable: boolean;
  /** Checks the PIN or password; on success the lock screen goes. */
  unlock(secret: string): Promise<UnlockResult>;
  unlockWithBiometrics(): Promise<boolean>;
  lockNow(): void;
  create(kind: LockKind, secret: string): Promise<void>;
  change(kind: LockKind, secret: string): Promise<void>;
  remove(): Promise<void>;
  setBiometrics(on: boolean): Promise<void>;
  setAutoLock(autoLock: AutoLock): void;
  /** Whether a protected connection or group (see protectionScope) is open right now. */
  isAuthorized(scope: string): boolean;
  authorize(scope: string): void;
  /** Closes every protected scope but `keep`: the person left them. */
  revokeExcept(keep: string | null): void;
};

const LockContext = createContext<LockContextValue | null>(null);

/**
 * The app lock. Its screen covers the app (which keeps running underneath, sessions and
 * all) on launch and after the app was away longer than the auto-lock time. While the app
 * is in the app switcher, a plain cover hides what is on screen.
 */
export function LockProvider({ children }: PropsWithChildren) {
  const { connections } = useConnections();
  const [vault] = useState(() => {
    const created = new Vault();
    // A new provider is a new launch: start with the vault closed.
    created.close();
    return created;
  });
  const [settings, setSettings] = useState(() => vault.settings());
  const [locked, setLocked] = useState(() => settings !== null);
  const [covered, setCovered] = useState(false);
  const [scopes, setScopes] = useState<ReadonlySet<string>>(new Set());
  const [biometricsAvailable] = useState(() => secretsSupported && biometricsSupported());

  useEffect(() => {
    let leftAt: number | null = null;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        setCovered(false);
        const current = vault.settings();
        if (current && leftAt !== null && Date.now() - leftAt >= current.autoLock * 1000) {
          setLocked(true);
        }
        leftAt = null;
        return;
      }
      setCovered(true);
      if (state === 'background') {
        leftAt ??= Date.now();
        setScopes(new Set());
      }
    });
    return () => subscription.remove();
  }, [vault]);

  // Secrets saved before the app recorded their names.
  const secretNames = () => [APP_KEY_SECRET, ...connections.map(({ id }) => passwordKey(id))];
  const refresh = () => setSettings(vault.settings());

  const value: LockContextValue = {
    supported: secretsSupported,
    settings,
    locked: locked && settings !== null,
    biometricsAvailable,
    async unlock(secret) {
      const result = await vault.unlock(secret);
      if (result.ok) setLocked(false);
      return result;
    },
    async unlockWithBiometrics() {
      const ok = await vault.unlockWithBiometrics('Unlock Flare');
      if (ok) setLocked(false);
      return ok;
    },
    lockNow() {
      setScopes(new Set());
      setLocked(true);
    },
    async create(kind, secret) {
      await vault.create(kind, secret, secretNames());
      refresh();
    },
    async change(kind, secret) {
      await vault.change(kind, secret);
      refresh();
    },
    async remove() {
      await vault.remove(secretNames());
      refresh();
    },
    async setBiometrics(on) {
      await vault.setBiometrics(on);
      refresh();
    },
    setAutoLock(autoLock) {
      vault.setAutoLock(autoLock);
      refresh();
    },
    isAuthorized: (scope) => scopes.has(scope),
    authorize: (scope) => setScopes((current) => new Set(current).add(scope)),
    revokeExcept(keep) {
      setScopes((current) => {
        if ([...current].every((scope) => scope === keep)) return current;
        return keep && current.has(keep) ? new Set([keep]) : new Set();
      });
    },
  };

  return (
    <LockContext value={value}>
      {children}
      {value.locked ? <LockScreen /> : settings && covered ? <PrivacyCover /> : null}
    </LockContext>
  );
}

export function useLock(): LockContextValue {
  const value = use(LockContext);
  if (!value) throw new Error('useLock must be used inside <LockProvider>');
  return value;
}

function LockScreen() {
  const theme = useTheme();

  return (
    <KeyboardAvoidingView
      behavior="padding"
      style={[StyleSheet.absoluteFill, styles.cover, { backgroundColor: theme.background }]}>
      <View style={styles.panel}>
        <UnlockPanel title="Flare is locked" autoBiometrics />
      </View>
    </KeyboardAvoidingView>
  );
}

/** What the app switcher's snapshot shows: the wordmark, nothing from the sessions. */
function PrivacyCover() {
  const theme = useTheme();

  return (
    <View
      aria-hidden
      style={[StyleSheet.absoluteFill, styles.cover, { backgroundColor: theme.background }]}>
      <Icon name="lock" size={28} color="textSecondary" />
      <ThemedText style={styles.brand}>flare</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  cover: { zIndex: 100, alignItems: 'center', justifyContent: 'center', gap: Spacing.two },
  panel: { width: '100%', maxWidth: 420, padding: Spacing.four },
  brand: { ...mono(600), fontSize: 24, lineHeight: 30 },
});
