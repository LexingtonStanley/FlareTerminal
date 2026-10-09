import { Link, useLocalSearchParams, useRouter } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { Screen } from '@/components/ui/screen';
import { GroupForm } from '@/features/groups/group-form';
import { useGroups } from '@/features/groups/groups-provider';

export default function EditGroupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { groups, save, remove } = useGroups();
  const router = useRouter();
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const group = groups.find((candidate) => candidate.id === id);

  if (!group) {
    return (
      <Screen centered>
        <ThemedText type="subtitle" role="heading">
          Group not found
        </ThemedText>
        <Link href="/">
          <ThemedText type="linkPrimary">Back home</ThemedText>
        </Link>
      </Screen>
    );
  }

  return (
    <GroupForm
      initial={{ name: group.name, protected: group.protected }}
      others={groups.filter((other) => other.id !== group.id)}
      submitLabel="Save"
      onSubmit={(input) => {
        save(input, group.id);
        leave();
      }}
      // Its connections stay, ungrouped.
      onDelete={() => {
        remove(group.id);
        leave();
      }}
    />
  );
}
