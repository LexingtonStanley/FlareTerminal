import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { TextField } from '@/components/ui/text-field';
import { ToggleRow } from '@/components/ui/toggle-row';
import { Spacing } from '@/constants/theme';
import { useLock } from '@/features/vault/lock-provider';

import { EMPTY_GROUP_INPUT, validateGroup, type Group, type GroupInput } from './groups';

type GroupFormProps = {
  initial?: GroupInput;
  /** The other groups, whose names this one can't take. */
  others: Group[];
  submitLabel: string;
  onSubmit(input: GroupInput): void;
  onDelete?(): void;
};

export function GroupForm({
  initial = EMPTY_GROUP_INPUT,
  others,
  submitLabel,
  onSubmit,
  onDelete,
}: GroupFormProps) {
  const lock = useLock();
  const [values, setValues] = useState(initial);
  const [error, setError] = useState<string>();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  function submit() {
    const next = validateGroup(values, others) ?? undefined;
    setError(next);
    if (!next) onSubmit(values);
  }

  return (
    <Screen scroll edges={['left', 'right', 'bottom']} style={styles.screen}>
      <TextField
        label="Name"
        placeholder="e.g. Work, Home lab, Production"
        value={values.name}
        onChangeText={(name) => setValues((current) => ({ ...current, name }))}
        error={error}
        returnKeyType="done"
        onSubmitEditing={submit}
      />
      <Card flush>
        <ToggleRow
          title="Require unlock"
          caption={
            lock.settings
              ? 'Ask for the app lock each time you come back to any of its sessions'
              : lock.supported
                ? 'Turn on the app lock in Settings first'
                : 'Needs the app lock in the Android and iOS apps'
          }
          value={values.protected}
          disabled={!lock.settings && !values.protected}
          onChange={(on) => setValues((current) => ({ ...current, protected: on }))}
        />
      </Card>
      <View style={styles.actions}>
        <Button title={submitLabel} onPress={submit} />
        {onDelete ? (
          <Button
            title={confirmingDelete ? 'Tap again to delete' : 'Delete group'}
            variant="danger"
            onPress={() => (confirmingDelete ? onDelete() : setConfirmingDelete(true))}
          />
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { gap: Spacing.three + 4 },
  actions: { gap: Spacing.two + 2, marginTop: Spacing.two },
});
