import { Stack } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Icon } from '@/components/ui/icon';
import { Screen } from '@/components/ui/screen';
import { Spacing } from '@/constants/theme';
import { AccessoryBar } from '@/features/keyboard/accessory-bar';
import { CodingKeyboard } from '@/features/keyboard/coding-keyboard';
import { describeInput, usePreviewSession } from '@/features/keyboard/preview-session';
import { useTerminalTheme } from '@/features/settings/use-terminal-theme';
import TerminalView, { type TerminalViewHandle } from '@/features/terminal/terminal-view';
import { useShape, useTheme, useType } from '@/hooks/use-theme';

/**
 * Both in-app keyboards on a real terminal view, with a log of the exact bytes each key
 * sends. For trying the keyboards on a phone, and for the Playwright spec. The terminal
 * only echoes the line being typed; there is no host behind it.
 */
export default function KeyboardPreviewScreen() {
  const theme = useTheme();
  const shape = useShape();
  const { mono } = useType();
  const terminalTheme = useTerminalTheme();
  const headerHeight = useHeaderHeight();
  const [mode, setMode] = useState<'bar' | 'keyboard'>('bar');
  const { keyboardProps, sent, line, clear } = usePreviewSession();
  const viewRef = useRef<TerminalViewHandle>(null);
  const logRef = useRef<ScrollView>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Redraw the prompt line: carriage return, erase line, prompt, text.
    if (ready) viewRef.current?.write(`\r\x1b[2K\x1b[32m~/flare\x1b[0m $ ${line}`);
  }, [ready, line]);

  return (
    <Screen edges={['left', 'right', 'bottom']} style={styles.screen}>
      <Stack.Screen options={{ headerShown: true, title: 'Keyboard preview' }} />
      <KeyboardAvoidingView
        style={styles.flex}
        // keyboard-controller's version, so Android's edge-to-edge layout avoids it too.
        behavior="padding"
        keyboardVerticalOffset={headerHeight}>
        <View style={[styles.flex, { backgroundColor: terminalTheme.background }]}>
          <TerminalView
            ref={viewRef}
            theme={terminalTheme}
            fontSize={15}
            onReady={() => setReady(true)}
            onInput={keyboardProps.onText}
            onResize={() => {}}
            onTitleChange={() => {}}
            onOpenLink={() => {}}
            dom={{
              style: styles.flex,
              scrollEnabled: false,
              bounces: false,
              overScrollMode: 'never',
              hideKeyboardAccessoryView: true,
            }}
          />
        </View>
        <ThemedView type="keyboard" style={[styles.logBar, { borderColor: theme.border }]}>
          <ThemedText type="caption" themeColor="textSecondary">
            Sent
          </ThemedText>
          <ScrollView
            ref={logRef}
            horizontal
            style={styles.flex}
            showsHorizontalScrollIndicator={false}
            onContentSizeChange={() => logRef.current?.scrollToEnd({ animated: false })}>
            <View style={styles.chips} aria-label="Sent">
              {sent.map((data, index) => (
                <Text
                  key={index}
                  style={[
                    styles.chip,
                    mono(500),
                    {
                      borderRadius: Math.max(0, shape.radius.small - 2),
                      color: theme.text,
                      backgroundColor: theme.key,
                      boxShadow: `0 1px 0 ${theme.keyShadow}`,
                    },
                  ]}>
                  {describeInput(data)}
                </Text>
              ))}
            </View>
          </ScrollView>
          <Pressable role="button" aria-label="Clear" onPress={clear} hitSlop={8}>
            <ThemedText type="link" themeColor="primary">
              Clear
            </ThemedText>
          </Pressable>
        </ThemedView>
        {mode === 'bar' ? (
          <>
            <AccessoryBar {...keyboardProps} onOpenKeyboard={() => setMode('keyboard')} />
            {Platform.OS === 'web' ? (
              // Where the phone's own keyboard would be; on a device it really opens.
              <ThemedView type="backgroundSelected" style={styles.systemKeyboard}>
                <Icon name="keyboard" size={28} />
                <ThemedText type="small" themeColor="textSecondary">
                  The phone’s keyboard opens here
                </ThemedText>
              </ThemedView>
            ) : null}
          </>
        ) : (
          <CodingKeyboard
            {...keyboardProps}
            onHide={() => setMode('bar')}
            onUseSystemKeyboard={() => setMode('bar')}
          />
        )}
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { padding: 0, gap: 0, maxWidth: '100%' },
  logBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 2,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  chips: { flexDirection: 'row', gap: Spacing.one + 1, alignItems: 'center', paddingBottom: 1 },
  chip: {
    fontSize: 13,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    overflow: 'hidden',
  },
  systemKeyboard: {
    height: 220,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
});
