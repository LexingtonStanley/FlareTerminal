import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import { secretsSupported } from '@/lib/secrets';

import { createAppKey, deleteAppKey, loadAppKey } from './app-key';
import { publicKeyLine } from './user-key';

/** The shell command that authorizes the app's key on a computer. */
export function authorizeCommand(line: string) {
  return `mkdir -p ~/.ssh && echo '${line}' >> ~/.ssh/authorized_keys`;
}

/** Settings card for the app's optional SSH key. */
export function AppKeyCard() {
  const [key, setKey] = useState(() => (secretsSupported ? loadAppKey() : null));
  const [copied, setCopied] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  if (!secretsSupported) {
    return (
      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="smallBold">SSH key</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          SSH keys live in the Android and iOS apps.
        </ThemedText>
      </ThemedView>
    );
  }

  if (!key) {
    return (
      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="smallBold">SSH key</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Optional. With a key, computers that list it sign you in without a password. It never
          leaves this phone.
        </ThemedText>
        <Button title="Create SSH key" variant="secondary" onPress={() => setKey(createAppKey())} />
      </ThemedView>
    );
  }

  const line = publicKeyLine(key);
  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold">SSH key</ThemedText>
      <ThemedText type="code" selectable aria-label="Public key">
        {line}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        To use it, run this once on each computer (for example in a session signed in with your
        password):
      </ThemedText>
      <ThemedText type="code" selectable>
        {authorizeCommand(line)}
      </ThemedText>
      <Button
        title={copied ? 'Copied' : 'Copy command'}
        variant="secondary"
        onPress={async () => {
          await Clipboard.setStringAsync(authorizeCommand(line));
          setCopied(true);
        }}
      />
      <Button
        title={confirmingDelete ? 'Tap again to delete the key' : 'Delete key'}
        variant="secondary"
        onPress={() => {
          if (!confirmingDelete) return setConfirmingDelete(true);
          deleteAppKey();
          setKey(null);
          setConfirmingDelete(false);
        }}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.two, padding: Spacing.three, borderRadius: Spacing.three },
});
