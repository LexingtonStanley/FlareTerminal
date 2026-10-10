import { StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';

type FileFrameProps = {
  /** The page (see page.ts). */
  html: string;
  /** Whether the page may run scripts. */
  scripts: boolean;
  label: string;
  backgroundColor: string;
  /** The page wants to go to an http(s) address: the viewer decides whether it opens. */
  onLink(url: string): void;
};

/** The page itself, and in-page jumps (#section): about:blank is where an HTML source loads. */
const isOwnPage = (url: string) => /^about:(blank|srcdoc)(#|$)/i.test(url);

/**
 * A file's page in a web view with nothing joining it to the app: no message handler, no
 * injected script. It never navigates away: an http(s) link goes to `onLink`, and every
 * other address (tel:, intent:, data:, Flare's own links) does nothing.
 */
export function FileFrame({ html, scripts, label, backgroundColor, onLink }: FileFrameProps) {
  return (
    <WebView
      // A web view takes JavaScript on or off with its next page: a new one, then.
      key={scripts ? 'scripts' : 'static'}
      source={{ html }}
      aria-label={label}
      style={[styles.frame, { backgroundColor }]}
      javaScriptEnabled={scripts}
      // Every address reaches the check below, rather than another app (the default).
      originWhitelist={['*']}
      onShouldStartLoadWithRequest={({ url, isTopFrame }) => {
        if (isOwnPage(url)) return true;
        // A frame inside a page that runs scripts is the page's to load. (Only iOS says
        // which frame asks; on Android it counts as the page.)
        if (isTopFrame === false) return scripts && /^https?:/i.test(url);
        if (/^https?:/i.test(url)) onLink(url);
        return false;
      }}
      onOpenWindow={({ nativeEvent }) => {
        if (/^https?:/i.test(nativeEvent.targetUrl)) onLink(nativeEvent.targetUrl);
      }}
      // Nothing loads around the checks: no link previews on iOS, no phone numbers as links.
      allowsLinkPreview={false}
      dataDetectorTypes="none"
      allowFileAccess={false}
      domStorageEnabled={scripts}
    />
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1 },
});
