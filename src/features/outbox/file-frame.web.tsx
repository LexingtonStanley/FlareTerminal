type FileFrameProps = {
  html: string;
  scripts: boolean;
  label: string;
  backgroundColor: string;
  onLink(url: string): void;
};

/**
 * The web build's viewer (see file-frame.tsx): the page in a sandboxed frame, which runs
 * scripts only when allowed and can't reach the app. Links open in a new tab.
 */
export function FileFrame({ html, scripts, label, backgroundColor }: FileFrameProps) {
  return (
    <iframe
      key={scripts ? 'scripts' : 'static'}
      title={label}
      aria-label={label}
      // After the doctype, which must come first.
      srcDoc={html.replace(/^(\s*<!doctype[^>]*>)?/i, '$1<base target="_blank">')}
      sandbox={`allow-popups allow-popups-to-escape-sandbox${scripts ? ' allow-scripts' : ''}`}
      style={{ flex: 1, width: '100%', height: '100%', border: 0, backgroundColor }}
    />
  );
}
