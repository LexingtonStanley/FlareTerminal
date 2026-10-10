import { useLocalSearchParams, useRouter } from 'expo-router';

import { ConfigImportForm } from '@/features/connections/config-import-form';

export default function ImportConnectionsScreen() {
  // Started from a group's tab on Home: the connections go in that group.
  const { groupId } = useLocalSearchParams<{ groupId?: string }>();
  const router = useRouter();

  return <ConfigImportForm groupId={groupId} onImported={() => router.dismissTo('/')} />;
}
