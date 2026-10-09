import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View, type TextStyle } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Spacing } from '@/constants/theme';
import { usePreferences } from '@/features/settings/preferences-provider';
import { useTerminalTheme } from '@/features/settings/use-terminal-theme';
import { useShape, useTheme, useType } from '@/hooks/use-theme';

import { palette, spanStyle } from './colors';
import type { StyledLine } from './history';
import { FOLDED_LINES, folds, type Block } from './transcript';

type Item = { key: string; block: Block };

/** Lines of styled text as one selectable run, so a selection can cross them. */
function useLineRenderer() {
  const terminal = useTerminalTheme();
  const { mono } = useType();
  const colors = useMemo(() => palette(terminal), [terminal]);
  return (lines: StyledLine[]) =>
    lines.map((line, index) => (
      <Fragment key={index}>
        {index > 0 ? '\n' : null}
        {line.map((span, at) => (
          <Text key={at} style={spanStyle(span, colors, terminal, mono)}>
            {span.text}
          </Text>
        ))}
      </Fragment>
    ));
}

/**
 * A session's history, newest at the bottom and shown first: paragraphs as selectable text
 * in the terminal's colours, and tool calls with their output folded to its first lines.
 */
export function HistoryList({ blocks }: { blocks: Block[] }) {
  const terminal = useTerminalTheme();
  const { fontSize } = usePreferences();
  const { mono } = useType();
  const renderLines = useLineRenderer();
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  // Inverted, so it opens at the newest output, like the terminal.
  const items = useMemo<Item[]>(
    () => blocks.map((block, index) => ({ key: String(index), block })).reverse(),
    [blocks]
  );
  const text: TextStyle = {
    ...mono(),
    fontSize,
    lineHeight: Math.round(fontSize * 1.45),
    color: terminal.foreground,
  };

  function toggle(key: string) {
    setOpen((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }

  return (
    <FlatList
      inverted
      data={items}
      extraData={open}
      keyExtractor={(item) => item.key}
      style={{ backgroundColor: terminal.background }}
      contentContainerStyle={styles.content}
      ItemSeparatorComponent={Separator}
      keyboardShouldPersistTaps="handled"
      initialNumToRender={20}
      windowSize={11}
      renderItem={({ item }) => (
        <HistoryBlock
          block={item.block}
          open={open.has(item.key)}
          onToggle={() => toggle(item.key)}
          text={text}
          renderLines={renderLines}
        />
      )}
    />
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

function HistoryBlock({
  block,
  open,
  onToggle,
  text,
  renderLines,
}: {
  block: Block;
  open: boolean;
  onToggle(): void;
  text: TextStyle;
  renderLines(lines: StyledLine[]): ReactNode;
}) {
  const theme = useTheme();
  const shape = useShape();
  const { sans } = useType();

  if (block.kind === 'rule') {
    return (
      <View style={[styles.rule, { borderTopWidth: shape.hairline, borderColor: theme.border }]} />
    );
  }
  if (block.kind === 'text') {
    return (
      <Text selectable style={text}>
        {renderLines(block.lines)}
      </Text>
    );
  }

  const folding = folds(block);
  const shown = folding && !open ? block.body.slice(0, FOLDED_LINES) : block.body;
  const hidden = block.body.length - shown.length;
  return (
    <View
      style={[
        styles.tool,
        { borderLeftWidth: Math.max(2, shape.hairline), borderColor: theme.border },
      ]}>
      <Text selectable style={text}>
        {renderLines([block.header])}
      </Text>
      {shown.length ? (
        <Text selectable style={text}>
          {renderLines(shown)}
        </Text>
      ) : null}
      {folding ? (
        <Pressable
          role="button"
          aria-expanded={open}
          onPress={onToggle}
          hitSlop={8}
          style={({ pressed }) => [
            styles.more,
            { borderRadius: shape.radius.small },
            pressed && { backgroundColor: theme.backgroundSelected },
          ]}>
          <Icon name={open ? 'collapse' : 'expand'} size={16} />
          <Text style={[styles.moreText, sans(500), { color: theme.textSecondary }]}>
            {open ? 'Show less' : `Show ${hidden} more ${hidden === 1 ? 'line' : 'lines'}`}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three },
  separator: { height: Spacing.three - 4 },
  rule: { alignSelf: 'stretch' },
  tool: { gap: Spacing.half, paddingLeft: Spacing.two },
  more: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: Spacing.one,
    minHeight: 32,
    paddingHorizontal: Spacing.one,
  },
  moreText: { fontSize: 13 },
});
