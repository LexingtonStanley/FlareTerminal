import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { secretsSupported } from '@/lib/secrets';

import { createAppKey, deleteAppKey, loadAppKey } from './app-key';
import { publicKeyLine } from './user-key';

/** The shell command that authorizes the app's key on a computer. */
export function authorizeCommand(line: string) {
  return `mkdir -p ~/.ssh && echo '${line}' >> ~/.ssh/authorized_keys`;
}

/** Settings card for the app's optional SSH key. */
export function AppKeyCard() {
  const theme = useTheme();
  const [key, setKey] = useState(() => (secretsSupported ? loadAppKey() : null));
  const [copied, setCopied] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const well = [styles.well, { backgroundColor: theme.backgroundSelected }];

  if (!secretsSupported) {
    return (
      <Card>
        <View style={styles.lead}>
          <Icon name="key" size={18} />
          <ThemedText type="small" themeColor="textSecondary" style={styles.grow}>
            SSH keys live in the Android and iOS apps.
          </ThemedText>
        </View>
      </Card>
    );
  }

  if (!key) {
    return (
      <Card>
        <View style={styles.lead}>
          <Icon name="key" size={18} />
          <ThemedText type="small" themeColor="textSecondary" style={styles.grow}>
            Optional. With a key, computers that list it sign you in without a password. It never
            leaves this phone.
          </ThemedText>
        </View>
        <Button
          title="Create SSH key"
          icon="key"
          variant="secondary"
          size="small"
          onPress={() => setKey(createAppKey())}
        />
      </Card>
    );
  }

  const line = publicKeyLine(key);
  return (
    <Card>
      <ThemedText type="eyebrow" themeColor="textSecondary">
        Public key
      </ThemedText>
      <ThemedText type="code" selectable aria-label="Public key" style={well}>
        {line}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        To use it, run this once on each computer (for example in a session signed in with your
        password):
      </ThemedText>
      <ThemedText type="code" selectable style={well}>
        {authorizeCommand(line)}
      </ThemedText>
      <Button
        title={copied ? 'Copied' : 'Copy command'}
        icon={copied ? 'check' : 'copy'}
        variant="secondary"
        size="small"
        onPress={async () => {
          await Clipboard.setStringAsync(authorizeCommand(line));
          setCopied(true);
        }}
      />
      <Button
        title={confirmingDelete ? 'Tap again to delete the key' : 'Delete key'}
        variant="danger"
        size="small"
        onPress={() => {
          if (!confirmingDelete) return setConfirmingDelete(true);
          deleteAppKey();
          setKey(null);
          setConfirmingDelete(false);
        }}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  lead: { flexDirection: 'row', gap: Spacing.two + 2 },
  grow: { flex: 1 },
  well: {
    padding: Spacing.three - 4,
    borderRadius: Radius.small + 2,
    overflow: 'hidden',
    fontSize: 12,
    lineHeight: 18,
  },
});
