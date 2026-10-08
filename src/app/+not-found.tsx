import { Link } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { Screen } from '@/components/ui/screen';

export default function NotFoundScreen() {
  return (
    <Screen centered>
      <ThemedText type="subtitle" role="heading">
        Page not found
      </ThemedText>
      <Link href="/">
        <ThemedText type="linkPrimary">Go to the home screen</ThemedText>
      </Link>
    </Screen>
  );
}
