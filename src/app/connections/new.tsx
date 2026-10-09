import { useLocalSearchParams, useRouter } from 'expo-router';

import { ConnectionForm } from '@/features/connections/connection-form';
import { EMPTY_CONNECTION_INPUT } from '@/features/connections/connections';
import { useConnections } from '@/features/connections/connections-provider';

export default function NewConnectionScreen() {
  const { save } = useConnections();
  // Started from a group's tab on Home: the connection goes in that group.
  const { groupId } = useLocalSearchParams<{ groupId?: string }>();
  const router = useRouter();
  // Opened from a deep link there is nothing to go back to.
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));

  return (
    <ConnectionForm
      initial={{ ...EMPTY_CONNECTION_INPUT, groupId: groupId ?? '' }}
      submitLabel="Save"
      onSubmit={(input) => {
        save(input);
        leave();
      }}
    />
  );
}
