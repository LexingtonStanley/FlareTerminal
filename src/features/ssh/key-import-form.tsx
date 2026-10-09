import * as Clipboard from 'expo-clipboard';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { useLock } from '@/features/vault/lock-provider';

import { AbortError } from './bcrypt-pbkdf';
import { fingerprint } from './host-keys';
import type { SavedKey } from './keys';
import { useKeys } from './keys-provider';
import { importPrivateKey, KeyImportError, needsPassphrase } from './private-key';
import { publicKeyBlob } from './user-key';

type Errors = { key?: string; passphrase?: string };

/** Paste an OpenSSH private key (and its passphrase) to keep it in the vault. */
export function KeyImportForm({ onImported }: { onImported(key: SavedKey): void }) {
  const { keys, importKey } = useKeys();
  const lock = useLock();
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  /** What was pasted with the button, so it can be cleared from the clipboard afterwards. */
  const [pasted, setPasted] = useState<string | null>(null);
  const encrypted = needsPassphrase(text) === true;
  // Leaving mid-import stops it: the key isn't saved and nothing navigates.
  const importing = useRef<AbortController | null>(null);
  useEffect(() => () => importing.current?.abort(), []);

  async function paste() {
    const clipboard = await Clipboard.getStringAsync();
    setText(clipboard);
    setPasted(clipboard);
    setErrors({});
  }

  async function submit() {
    if (progress) return;
    if (!text.trim()) return setErrors({ key: 'Paste your private key' });
    setErrors({});
    setProgress({ done: 0, total: 1 });
    const controller = new AbortController();
    importing.current = controller;
    try {
      const imported = await importPrivateKey(text, encrypted ? passphrase : '', {
        onProgress: (done, total) => setProgress({ done, total }),
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      const print = fingerprint(publicKeyBlob(imported.key));
      const existing = keys.find((key) => key.fingerprint === print);
      if (existing) {
        setErrors({ key: `You already have this key, named ${existing.name}.` });
        return;
      }
      const saved = importKey(name, imported);
      // A private key shouldn't stay on the clipboard, where other apps can read it.
      if (pasted !== null && pasted === text) await Clipboard.setStringAsync('');
      onImported(saved);
    } catch (error) {
      if (error instanceof AbortError) return;
      setErrors(
        error instanceof KeyImportError
          ? { [error.field]: error.message }
          : { key: 'Flare couldn’t read this key. Copy it again.' }
      );
    } finally {
      setProgress(null);
    }
  }

  return (
    <Screen scroll edges={['left', 'right', 'bottom']} style={styles.screen}>
      <ThemedText type="small" themeColor="textSecondary">
        Paste a private key from your computer, such as ~/.ssh/id_ed25519. Ed25519, ECDSA and RSA
        keys in OpenSSH format work.
      </ThemedText>

      <View style={styles.field}>
        <TextField
          label="Private key"
          placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
          multiline
          maxLines={6}
          monospace
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          value={text}
          onChangeText={(next) => {
            setText(next);
            setErrors({});
          }}
          error={errors.key}
        />
        <Button title="Paste" icon="paste" variant="secondary" size="small" onPress={paste} />
      </View>

      {encrypted ? (
        <TextField
          label="Passphrase"
          hint="Only used to unlock the key now. Flare doesn't keep it."
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          returnKeyType="done"
          onSubmitEditing={submit}
          value={passphrase}
          onChangeText={(next) => {
            setPassphrase(next);
            setErrors(({ key }) => ({ key }));
          }}
          error={errors.passphrase}
        />
      ) : null}

      <TextField
        label="Name"
        placeholder="Optional, e.g. Work laptop"
        hint="Left empty, the key is named after its comment."
        returnKeyType="done"
        value={name}
        onChangeText={setName}
      />

      <Callout>
        {lock.settings
          ? 'The key is encrypted in the vault with your app lock and never leaves this phone.'
          : 'The key is kept in this phone’s secure storage and never leaves it. Turn on the app lock in Settings to encrypt it with your PIN or password too.'}
      </Callout>

      <View style={styles.actions}>
        <Button title="Import key" onPress={submit} loading={progress !== null} />
        {progress && progress.total > 1 ? (
          <ThemedText type="caption" themeColor="textSecondary" role="status" style={styles.center}>
            Unlocking the key with its passphrase:{' '}
            {Math.round((100 * progress.done) / progress.total)}%
          </ThemedText>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { gap: Spacing.three + 4 },
  field: { gap: Spacing.two },
  actions: { gap: Spacing.two + 2, marginTop: Spacing.two },
  center: { textAlign: 'center' },
});
