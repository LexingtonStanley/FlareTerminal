import * as Clipboard from 'expo-clipboard';
import { Link, Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { openBrowserAsync } from 'expo-web-browser';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { IconButton } from '@/components/ui/icon-button';
import { Screen } from '@/components/ui/screen';
import { ToggleRow } from '@/components/ui/toggle-row';
import { Spacing } from '@/constants/theme';
import { FileFrame } from '@/features/outbox/file-frame';
import { formatSize, MAX_FILE_BYTES } from '@/features/outbox/outbox';
import { useOutbox, useOutboxFiles } from '@/features/outbox/outbox-provider';
import type { OutboxFile } from '@/features/outbox/outbox-store';
import { htmlPage, markdownPage } from '@/features/outbox/page';
import { formatSince } from '@/features/sessions/inbox';
import { useLock } from '@/features/vault/lock-provider';
import { UnlockPanel } from '@/features/vault/unlock-panel';
import { useProtection } from '@/features/vault/use-protection';
import { shadows, useAppTheme, useShape, useType } from '@/hooks/use-theme';

/** A file an agent sent: Markdown drawn as a page, HTML as the agent made it. */
export default function OutboxFileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const file = useOutboxFiles().find((candidate) => candidate.id === id);
  const { settings, isAuthorized, authorize } = useLock();
  const scope = useProtection()(file?.connectionId ?? '');

  if (!file) {
    return (
      <Screen centered>
        <Stack.Screen options={{ title: 'File' }} />
        <ThemedText type="subtitle" role="heading">
          File not found
        </ThemedText>
        <ThemedText themeColor="textSecondary">
          It was deleted, or made room for newer files.
        </ThemedText>
        <Link href="/inbox">
          <ThemedText type="linkPrimary">Go to the inbox</ThemedText>
        </Link>
      </Screen>
    );
  }

  // A protected connection's files ask for the lock, as its sessions do.
  if (scope && settings && !isAuthorized(scope)) {
    return (
      <Screen scroll centered edges={['left', 'right', 'bottom']}>
        <Stack.Screen options={{ title: 'File' }} />
        <UnlockPanel
          title="Unlock this file"
          message={`It came from ${file.host}, which is protected.`}
          autoBiometrics
          onUnlocked={() => authorize(scope)}
        />
      </Screen>
    );
  }

  // A newer version starts afresh: read again, scripts off.
  return <FileViewer key={file.receivedAt} file={file} />;
}

/** How long Copy shows that it copied. */
const COPIED_MS = 2000;

function FileViewer({ file }: { file: OutboxFile }) {
  const store = useOutbox();
  const router = useRouter();
  const { colors: theme, mode } = useAppTheme();
  const shape = useShape();
  const { mono } = useType();
  const [scripts, setScripts] = useState(false);
  /** An address an HTML page wants to open, until the person says whether to. */
  const [link, setLink] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [openedAt] = useState(() => Date.now());

  const text = useMemo(() => store.text(file.id), [store, file.id]);
  const page = useMemo(() => {
    if (text === null) return null;
    return file.kind === 'markdown' ? markdownPage(text, theme, mode) : htmlPage(text, scripts);
  }, [text, file.kind, theme, mode, scripts]);

  useEffect(() => store.markRead(file.id), [store, file.id]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy() {
    if (text === null) return;
    await Clipboard.setStringAsync(text);
    setCopied(true);
  }

  function remove() {
    store.remove(file.id);
    if (router.canGoBack()) router.back();
    else router.replace('/inbox');
  }

  // A Markdown page can only change address when the person taps a link. An HTML page can
  // try on its own, so it asks first.
  function onLink(url: string) {
    if (file.kind === 'markdown') void openBrowserAsync(url);
    else setLink(url);
  }

  const received = formatSince(openedAt - file.receivedAt);
  const format = file.kind === 'markdown' ? 'Markdown' : 'HTML';

  return (
    <Screen edges={['left', 'right', 'bottom']} style={styles.screen}>
      <Stack.Screen
        options={{
          title: file.name,
          headerRight: () => (
            <View style={styles.headerRight}>
              <IconButton
                icon={copied ? 'check' : 'copy'}
                label={copied ? 'Copied' : `Copy the ${format}`}
                disabled={text === null}
                onPress={copy}
              />
              <IconButton
                icon="trash"
                label="Delete from this phone"
                onPress={() => setDeleting(true)}
              />
            </View>
          ),
        }}
      />
      <View style={[styles.top, { borderColor: theme.border, borderBottomWidth: shape.hairline }]}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.meta}>
          {[
            `From ${file.host}`,
            formatSize(file.size),
            received === 'now' ? 'just now' : `${received} ago`,
          ].join(' · ')}
        </ThemedText>
        {file.kind === 'html' && page ? (
          <ToggleRow
            title="Run scripts"
            caption={
              scripts
                ? 'The page runs its own code and can load from the internet'
                : 'Off: the page shows as it is, and loads nothing from the internet'
            }
            value={scripts}
            onChange={setScripts}
          />
        ) : null}
      </View>

      {page ? (
        <FileFrame
          html={page}
          scripts={file.kind === 'html' && scripts}
          label={file.name}
          backgroundColor={theme.background}
          onLink={onLink}
        />
      ) : (
        <View style={styles.tooBig}>
          <ThemedText type="headline">Too big to bring over</ThemedText>
          <ThemedText themeColor="textSecondary">
            {`It’s ${formatSize(file.size)}; Flare brings files up to ${formatSize(MAX_FILE_BYTES)}. It’s still on ${file.host} in ~/.flare/outbox/.`}
          </ThemedText>
        </View>
      )}

      {link ? (
        <ThemedView
          type="backgroundRaised"
          role="alert"
          style={[
            styles.banner,
            {
              borderColor: theme.border,
              borderRadius: shape.radius.large,
              borderWidth: shape.hairline,
              boxShadow: shadows(shape.shadowFloat),
            },
          ]}>
          <View style={styles.bannerText}>
            <ThemedText type="smallBold">The page wants to open</ThemedText>
            <Text numberOfLines={2} style={[styles.address, mono(), { color: theme.text }]}>
              {link}
            </Text>
          </View>
          <Button
            title="Open"
            size="small"
            variant="secondary"
            label={`Open ${link} in the browser`}
            onPress={() => {
              void openBrowserAsync(link);
              setLink(null);
            }}
          />
          <IconButton icon="close" label="Don’t open it" onPress={() => setLink(null)} />
        </ThemedView>
      ) : null}

      {deleting ? (
        <ConfirmDialog
          title={`Delete ${file.name}?`}
          confirmTitle="Delete"
          onConfirm={remove}
          onCancel={() => setDeleting(false)}>
          <ThemedText themeColor="textSecondary">
            {`This removes the phone’s copy. The file stays on ${file.host}, and comes again only if it changes.`}
          </ThemedText>
        </ConfirmDialog>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  // Fixed to the window, so the page scrolls inside its frame.
  screen: { padding: 0, gap: 0, maxWidth: '100%', flex: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  top: { paddingTop: Spacing.two },
  meta: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.two },
  tooBig: { flex: 1, gap: Spacing.two, padding: Spacing.four },
  banner: {
    position: 'absolute',
    left: Spacing.three,
    right: Spacing.three,
    bottom: Spacing.four,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingLeft: Spacing.three,
    paddingVertical: Spacing.two,
  },
  bannerText: { flex: 1, gap: Spacing.half },
  address: { fontSize: 13 },
});
