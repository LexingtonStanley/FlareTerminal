import { Tabs } from 'expo-router';
import { SymbolView } from 'expo-symbols';

import { waitingFor } from '@/features/sessions/inbox';
import { useSessions } from '@/features/sessions/sessions-provider';
import { useShape, useTheme, useType } from '@/hooks/use-theme';

export default function TabsLayout() {
  const theme = useTheme();
  const { hairline } = useShape();
  const { sans } = useType();
  const waiting = useSessions().filter((session) => waitingFor(session)).length;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        // Monochrome: the accent is kept for actions and live sessions.
        tabBarActiveTintColor: theme.text,
        tabBarInactiveTintColor: theme.textSecondary,
        tabBarLabelStyle: { ...sans(500), fontSize: 11, lineHeight: 14 },
        // A 48pt item less its 5pt padding and the default 28pt icon box leaves the label
        // 10pt, which clips Geist's descenders. A 24pt box leaves it the 14pt line it needs.
        tabBarIconStyle: { height: 24 },
        tabBarStyle: {
          backgroundColor: theme.background,
          borderTopColor: theme.border,
          borderTopWidth: hairline,
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => (
            <SymbolView
              name={{ ios: 'terminal.fill', android: 'terminal', web: 'terminal' }}
              tintColor={color}
              size={size}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="inbox"
        options={{
          title: 'Inbox',
          // The count of agents waiting for the person, in the accent kept for them.
          tabBarBadge: waiting || undefined,
          tabBarBadgeStyle: {
            backgroundColor: theme.attention,
            color: theme.onPrimary,
            ...sans(600),
            fontSize: 11,
          },
          tabBarAccessibilityLabel: waiting ? `Inbox, ${waiting} need you` : 'Inbox',
          tabBarIcon: ({ color, size }) => (
            <SymbolView
              name={{ ios: 'tray.fill', android: 'inbox', web: 'inbox' }}
              tintColor={color}
              size={size}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => (
            <SymbolView
              name={{ ios: 'gearshape.fill', android: 'settings', web: 'settings' }}
              tintColor={color}
              size={size}
            />
          ),
        }}
      />
    </Tabs>
  );
}
