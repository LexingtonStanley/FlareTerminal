import { Link, Stack, useLocalSearchParams, useRouter } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { Screen } from '@/components/ui/screen';
import { KeyDetails } from '@/features/ssh/key-details';
import { useKeys } from '@/features/ssh/keys-provider';

export default function KeyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { keys } = useKeys();
  const router = useRouter();
  const savedKey = keys.find((key) => key.id === id);
  // Opened from a deep link there is nothing to go back to.
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/settings'));

  if (!savedKey) {
    return (
      <Screen centered>
        <ThemedText type="subtitle" role="heading">
          Key not found
        </ThemedText>
        <Link href="/settings">
          <ThemedText type="linkPrimary">Back to settings</ThemedText>
        </Link>
      </Screen>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: savedKey.name }} />
      <KeyDetails key={savedKey.id} savedKey={savedKey} onDeleted={leave} />
    </>
  );
}
