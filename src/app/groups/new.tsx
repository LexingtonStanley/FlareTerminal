import { useRouter } from 'expo-router';

import { GroupForm } from '@/features/groups/group-form';
import { useGroups } from '@/features/groups/groups-provider';

export default function NewGroupScreen() {
  const { groups, save } = useGroups();
  const router = useRouter();
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));

  return (
    <GroupForm
      others={groups}
      submitLabel="Save"
      onSubmit={(input) => {
        save(input);
        leave();
      }}
    />
  );
}
