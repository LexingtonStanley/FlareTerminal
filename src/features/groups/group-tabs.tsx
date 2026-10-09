import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Radius, sans, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import type { Group } from './groups';

/** Everything, ungrouped included. */
export const ALL_GROUPS = 'all';

type GroupTabsProps = {
  groups: Group[];
  /** ALL_GROUPS or a group's id. */
  selected: string;
  onSelect(id: string): void;
};

/**
 * Tabs that narrow Home to one group's sessions, shortcuts and connections. A long press
 * edits a group; the last tab makes one.
 */
export function GroupTabs({ groups, selected, onSelect }: GroupTabsProps) {
  const router = useRouter();
  const theme = useTheme();
  const tabs = [{ id: ALL_GROUPS, name: 'All', protected: false }, ...groups];

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      role="tablist"
      aria-label="Groups"
      style={styles.bar}
      contentContainerStyle={styles.tabs}>
      {tabs.map((group) => {
        const current = group.id === selected;
        return (
          <Pressable
            key={group.id}
            role="tab"
            aria-selected={current}
            aria-label={group.protected ? `${group.name}, protected` : group.name}
            onPress={() => onSelect(group.id)}
            onLongPress={() =>
              group.id !== ALL_GROUPS &&
              router.push({ pathname: '/groups/[id]', params: { id: group.id } })
            }
            style={({ pressed }) => [
              styles.tab,
              {
                backgroundColor: current
                  ? theme.primaryMuted
                  : pressed
                    ? theme.backgroundSelected
                    : theme.backgroundElement,
                borderColor: current ? theme.primary : theme.border,
              },
            ]}>
            {group.protected ? (
              <Icon name="lock" size={13} color={current ? 'primary' : 'textSecondary'} />
            ) : null}
            <Text
              numberOfLines={1}
              style={[styles.label, { color: current ? theme.primary : theme.text }]}>
              {group.name}
            </Text>
          </Pressable>
        );
      })}
      <Pressable
        role="button"
        aria-label="New group"
        onPress={() => router.push('/groups/new')}
        style={({ pressed }) => [
          styles.tab,
          styles.add,
          {
            borderColor: theme.border,
            backgroundColor: pressed ? theme.backgroundSelected : 'transparent',
          },
        ]}>
        <Icon name="add" size={15} color="textSecondary" />
        <Text style={[styles.label, { color: theme.textSecondary }]}>Group</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // Inside a screen's column, a horizontal list would otherwise grow to fill it.
  bar: { flexGrow: 0 },
  tabs: { alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.half },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    minHeight: 40,
    maxWidth: 200,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  add: { borderStyle: 'dashed', borderWidth: 1 },
  label: { ...sans(600), fontSize: 14, flexShrink: 1 },
});
