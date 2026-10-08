import { ThemedText } from '@/components/themed-text';
import { Screen } from '@/components/ui/screen';
import { useAuth } from '@/features/auth/auth-provider';

export default function HomeScreen() {
  const { session } = useAuth();

  return (
    <Screen scroll>
      <ThemedText type="subtitle" role="heading">
        Home
      </ThemedText>
      <ThemedText themeColor="textSecondary">Signed in as {session?.user.email}</ThemedText>
    </Screen>
  );
}
