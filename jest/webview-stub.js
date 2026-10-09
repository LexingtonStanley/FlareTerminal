// react-native-webview needs its native module. In Jest it is a View that keeps the props
// it was given (source, handlers), so a test can read them; its ref methods do nothing.
const React = require('react');
const { View } = require('react-native');

const noop = () => {};

const WebView = React.forwardRef(function WebViewStub(props, ref) {
  React.useImperativeHandle(ref, () => ({
    reload: noop,
    goBack: noop,
    goForward: noop,
    injectJavaScript: noop,
  }));
  return React.createElement(View, props);
});

module.exports = { WebView, default: WebView };
