import { Stack } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Screen } from '@/components/ui/screen';
import { Fonts, Spacing, TerminalColors } from '@/constants/theme';
import { AccessoryBar } from '@/features/keyboard/accessory-bar';
import { CodingKeyboard } from '@/features/keyboard/coding-keyboard';
import { describeInput, usePreviewSession } from '@/features/keyboard/preview-session';
import TerminalView, { type TerminalViewHandle } from '@/features/terminal/terminal-view';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Both in-app keyboards on a real terminal view, with a log of the exact bytes each key
 * sends. For trying the keyboards on a phone, and for the Playwright spec. The terminal
 * only echoes the line being typed; there is no host behind it.
 */
export default function KeyboardPreviewScreen() {
  const theme = useTheme();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
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
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={headerHeight}>
        <View style={[styles.flex, { backgroundColor: TerminalColors[scheme].background }]}>
          <TerminalView
            ref={viewRef}
            theme={TerminalColors[scheme]}
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
        <ThemedView type="backgroundElement" style={styles.logBar}>
          <ThemedText type="smallBold" themeColor="textSecondary">
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
                  style={[styles.chip, { color: theme.text, backgroundColor: theme.background }]}>
                  {describeInput(data)}
                </Text>
              ))}
            </View>
          </ScrollView>
          <Pressable role="button" aria-label="Clear" onPress={clear} hitSlop={8}>
            <ThemedText type="small" themeColor="primary">
              Clear
            </ThemedText>
          </Pressable>
        </ThemedView>
        {mode === 'bar' ? (
          <>
            <AccessoryBar {...keyboardProps} onOpenKeyboard={() => setMode('keyboard')} />
            {Platform.OS === 'web' ? (
              // Where the phone's own keyboard would be; on a device it really opens.
              <ThemedView type="backgroundElement" style={styles.systemKeyboard}>
                <ThemedText type="small" themeColor="textSecondary">
                  The phone’s keyboard opens here
                </ThemedText>
              </ThemedView>
            ) : null}
          </>
        ) : (
          <CodingKeyboard {...keyboardProps} onUseSystemKeyboard={() => setMode('bar')} />
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
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  chips: { flexDirection: 'row', gap: Spacing.one, alignItems: 'center' },
  chip: {
    fontFamily: Fonts.mono,
    fontSize: 13,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderRadius: Spacing.one,
    overflow: 'hidden',
  },
  systemKeyboard: { height: 220, alignItems: 'center', justifyContent: 'center' },
});
