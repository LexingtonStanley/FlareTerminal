import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Share, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { useConnections } from '@/features/connections/connections-provider';
import { useShape, useTheme } from '@/hooks/use-theme';

import { APP_KEY_ID, authorizeCommand, type SavedKey } from './keys';
import { useKeys } from './keys-provider';

type Copied = 'key' | 'command' | null;

/** A key's public half, how to put it on a computer, and renaming or deleting it. */
export function KeyDetails({ savedKey, onDeleted }: { savedKey: SavedKey; onDeleted(): void }) {
  const theme = useTheme();
  const { rename, remove } = useKeys();
  const { connections } = useConnections();
  const [name, setName] = useState(savedKey.name);
  const [copied, setCopied] = useState<Copied>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const { radius } = useShape();
  const well = [
    styles.well,
    {
      backgroundColor: theme.backgroundSelected,
      borderRadius: Math.min(radius.small + 2, radius.small * 2),
    },
  ];
  const usedBy = connections.filter(
    (connection) => connection.kind === 'ssh' && connection.keyId === savedKey.id
  );

  async function copy(what: Exclude<Copied, null>, text: string) {
    await Clipboard.setStringAsync(text);
    setCopied(what);
  }

  return (
    <Screen scroll edges={['left', 'right', 'bottom']} style={styles.screen}>
      {savedKey.id === APP_KEY_ID ? (
        <ThemedText type="small" themeColor="textSecondary">
          Flare made this key on this phone. Its private half has never left it.
        </ThemedText>
      ) : (
        <TextField
          label="Name"
          returnKeyType="done"
          value={name}
          onChangeText={setName}
          onBlur={() => rename(savedKey.id, name)}
          onSubmitEditing={() => rename(savedKey.id, name)}
        />
      )}

      <View style={styles.facts}>
        <ThemedText type="eyebrow" themeColor="textSecondary">
          {savedKey.kind}
        </ThemedText>
        <ThemedText type="code" selectable aria-label="Fingerprint">
          {savedKey.fingerprint}
        </ThemedText>
      </View>

      <Card>
        <ThemedText type="eyebrow" themeColor="textSecondary">
          Public key
        </ThemedText>
        <ThemedText type="code" selectable aria-label="Public key" style={well}>
          {savedKey.publicKey}
        </ThemedText>
        <View style={styles.buttons}>
          <Button
            title={copied === 'key' ? 'Copied' : 'Copy'}
            label="Copy public key"
            icon={copied === 'key' ? 'check' : 'copy'}
            variant="secondary"
            size="small"
            onPress={() => copy('key', savedKey.publicKey)}
          />
          <Button
            title="Share"
            label="Share public key"
            icon="share"
            variant="secondary"
            size="small"
            onPress={() => void Share.share({ message: savedKey.publicKey }).catch(() => {})}
          />
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          To sign in with it, run this once on each computer (for example in a session signed in
          with your password):
        </ThemedText>
        <ThemedText type="code" selectable style={well}>
          {authorizeCommand(savedKey.publicKey)}
        </ThemedText>
        <Button
          title={copied === 'command' ? 'Copied' : 'Copy command'}
          icon={copied === 'command' ? 'check' : 'copy'}
          variant="secondary"
          size="small"
          onPress={() => copy('command', authorizeCommand(savedKey.publicKey))}
        />
      </Card>

      <View style={styles.actions}>
        <ThemedText type="caption" themeColor="textSecondary">
          {usedBy.length
            ? `Chosen for ${usedBy.map((connection) => connection.name).join(', ')}. Deleted, they offer your other keys instead.`
            : 'Connections offer every key unless one is chosen for them.'}
        </ThemedText>
        <Button
          title={confirmingDelete ? 'Tap again to delete the key' : 'Delete key'}
          variant="danger"
          onPress={() => {
            if (!confirmingDelete) return setConfirmingDelete(true);
            remove(savedKey.id);
            onDeleted();
          }}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { gap: Spacing.three + 4 },
  facts: { gap: Spacing.one },
  buttons: { flexDirection: 'row', gap: Spacing.two },
  well: {
    padding: Spacing.three - 4,
    overflow: 'hidden',
    fontSize: 12,
    lineHeight: 18,
  },
  actions: { gap: Spacing.two + 2, marginTop: Spacing.two },
});
