import { openBrowserAsync } from 'expo-web-browser';
import { useEffect, useRef, useState } from 'react';
import { BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Spacing } from '@/constants/theme';
import { shadows, useShape, useTheme, useType } from '@/hooks/use-theme';

/** The web view's methods this screen uses (its types don't declare a ref). */
type WebViewHandle = {
  goBack(): void;
  goForward(): void;
  reload(): void;
  injectJavaScript(script: string): void;
};

type Navigation = { url: string; canGoBack: boolean; canGoForward: boolean };

/**
 * Pages only, inside the preview. Other schemes (app links, tel:, intent:) could hand the
 * page's choice to another app, or to Flare's own deep links, so they don't load at all.
 */
const isPageUrl = (url: string) => /^(https?|about|blob|data):/i.test(url);

/**
 * A browser for the host's dev server, reached through the forward on `localPort`. The
 * address bar names the host's port (`port`), which is what the person knows it by.
 */
export function PreviewBrowser({
  localPort,
  port,
  path,
  error,
  onClearError,
  onChangePort,
}: {
  localPort: number;
  port: number;
  path: string;
  /** Why the last request couldn't reach the host. */
  error: string | null;
  onClearError(): void;
  onChangePort(): void;
}) {
  const theme = useTheme();
  const shape = useShape();
  const { mono } = useType();
  const webView = useRef<WebViewHandle>(null);
  const origin = `http://localhost:${localPort}`;
  const [start, setStart] = useState(`${origin}${path}`);
  // Android's renderer can die (memory); its web view can't be used again, so a new one
  // takes its place at the same page.
  const [renderer, setRenderer] = useState(0);
  const [navigation, setNavigation] = useState<Navigation>({
    url: start,
    canGoBack: false,
    canGoForward: false,
  });
  const address = navigation.url.startsWith(origin)
    ? `localhost:${port}${navigation.url.slice(origin.length).replace(/^\/$/, '')}`
    : navigation.url.replace(/^https?:\/\//, '');

  // Android's back button goes back a page before it leaves the preview.
  useEffect(() => {
    if (!navigation.canGoBack) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      webView.current?.goBack();
      return true;
    });
    return () => subscription.remove();
  }, [navigation.canGoBack]);

  function reload() {
    onClearError();
    webView.current?.reload();
  }

  return (
    <View style={styles.flex}>
      <WebView
        key={renderer}
        ref={webView as never}
        source={{ uri: start }}
        aria-label={`Preview of localhost:${port}`}
        style={[styles.flex, { backgroundColor: theme.background }]}
        // Every scheme reaches the check below, rather than another app (the default).
        originWhitelist={['*']}
        onShouldStartLoadWithRequest={({ url }) => isPageUrl(url)}
        // target="_blank" and window.open stay in the preview.
        onOpenWindow={({ nativeEvent }) => {
          if (/^https?:/i.test(nativeEvent.targetUrl)) {
            webView.current?.injectJavaScript(
              `window.location.assign(${JSON.stringify(nativeEvent.targetUrl)});true;`
            );
          }
        }}
        onNavigationStateChange={({ url, canGoBack, canGoForward }) =>
          setNavigation({ url, canGoBack, canGoForward })
        }
        onLoadStart={onClearError}
        domStorageEnabled
        allowsBackForwardNavigationGestures
        allowsInlineMediaPlayback
        // iOS reclaimed the page's process: load it again rather than go blank.
        onContentProcessDidTerminate={() => webView.current?.reload()}
        onRenderProcessGone={() => {
          setStart(navigation.url);
          setRenderer((count) => count + 1);
        }}
        renderError={(_domain, _code, description) => (
          <ThemedView style={styles.failed}>
            <ThemedText type="headline" role="alert">
              The page didn’t load
            </ThemedText>
            <ThemedText themeColor="textSecondary">{error ?? description}</ThemedText>
            <Button title="Reload" icon="reconnect" variant="secondary" onPress={reload} />
          </ThemedView>
        )}
      />

      {error ? (
        <ThemedView
          type="backgroundRaised"
          style={[
            styles.banner,
            {
              borderColor: theme.border,
              borderRadius: shape.radius.large,
              borderWidth: shape.hairline,
              boxShadow: shadows(shape.shadowFloat),
            },
          ]}>
          <ThemedText type="small" role="alert" style={styles.flex}>
            {error}
          </ThemedText>
          <IconButton icon="close" label="Dismiss" onPress={onClearError} />
        </ThemedView>
      ) : null}

      <View
        role="toolbar"
        aria-label="Preview"
        style={[
          styles.toolbar,
          {
            backgroundColor: theme.background,
            borderColor: theme.border,
            borderTopWidth: shape.hairline,
          },
        ]}>
        <IconButton
          icon="back"
          label="Back"
          disabled={!navigation.canGoBack}
          onPress={() => webView.current?.goBack()}
        />
        <IconButton
          icon="forward"
          label="Forward"
          disabled={!navigation.canGoForward}
          onPress={() => webView.current?.goForward()}
        />
        <Pressable
          role="button"
          aria-label={`${address}, change port`}
          onPress={onChangePort}
          style={({ pressed }) => [
            styles.address,
            {
              backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement,
              borderRadius: shape.radius.medium,
            },
          ]}>
          <Text numberOfLines={1} style={[styles.addressText, mono(), { color: theme.text }]}>
            {address}
          </Text>
        </Pressable>
        <IconButton icon="reconnect" label="Reload" onPress={reload} />
        <IconButton
          icon="external"
          label="Open in browser"
          onPress={() => {
            if (/^https?:/i.test(navigation.url)) void openBrowserAsync(navigation.url);
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.half,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
  address: {
    flex: 1,
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: Spacing.three - 4,
  },
  addressText: { fontSize: 13 },
  banner: {
    position: 'absolute',
    left: Spacing.three,
    right: Spacing.three,
    bottom: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingLeft: Spacing.three,
    paddingVertical: Spacing.one,
  },
  failed: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    justifyContent: 'center',
    gap: Spacing.three - 4,
    padding: Spacing.four,
  },
});
