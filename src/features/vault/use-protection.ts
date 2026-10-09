import { useConnections } from '@/features/connections/connections-provider';
import { protectionScope } from '@/features/groups/groups';
import { useGroups } from '@/features/groups/groups-provider';

/**
 * The protection scope of a connection's sessions (see protectionScope), or null. Their text
 * stays out of lists, banners and notifications even before an app lock is set.
 */
export function useProtection(): (connectionId: string) => string | null {
  const { connections } = useConnections();
  const { groups } = useGroups();
  return (connectionId) =>
    protectionScope(
      connections.find(({ id }) => id === connectionId),
      groups
    );
}
