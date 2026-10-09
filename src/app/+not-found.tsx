import { Link, usePathname } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { Screen } from '@/components/ui/screen';

export default function NotFoundScreen() {
  const pathname = usePathname();

  return (
    <Screen centered>
      <ThemedText type="code" themeColor="textSecondary" numberOfLines={1}>
        cd: no such screen: {pathname}
      </ThemedText>
      <ThemedText type="subtitle" role="heading">
        Page not found
      </ThemedText>
      <Link href="/">
        <ThemedText type="linkPrimary">Go to the home screen</ThemedText>
      </Link>
    </Screen>
  );
}
