import { Fragment, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card, Divider } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Icon } from '@/components/ui/icon';
import { IconButton } from '@/components/ui/icon-button';
import { TextField } from '@/components/ui/text-field';
import { ToggleRow } from '@/components/ui/toggle-row';
import { Spacing } from '@/constants/theme';
import { usePreferences } from '@/features/settings/preferences-provider';
import { useType } from '@/hooks/use-theme';

import { isSaved, promptTitle, type SavedPrompt } from './prompts';
import { usePrompts } from './prompts-provider';

/**
 * Settings card for the composer's suggestions: whether the strip shows, and the saved
 * prompts, to add to or delete from.
 */
export function PromptsCard() {
  const { promptSuggestions, setPromptSuggestions } = usePreferences();
  const { prompts, add, remove } = usePrompts();
  const { mono } = useType();
  const [draft, setDraft] = useState('');
  const [deleting, setDeleting] = useState<SavedPrompt | null>(null);

  return (
    <Card flush>
      <ToggleRow
        title="Suggestions while writing"
        caption="The agent’s slash commands and your saved prompts, above the field you write in"
        value={promptSuggestions}
        onChange={setPromptSuggestions}
      />
      <Divider />
      {prompts.length ? (
        prompts.map((prompt, index) => (
          <Fragment key={prompt.id}>
            {index ? <Divider inset={Spacing.three} /> : null}
            <View style={styles.row}>
              <Icon name="prompt" size={16} />
              <ThemedText
                type="small"
                numberOfLines={3}
                style={[styles.grow, prompt.text.startsWith('/') && mono(400)]}>
                {prompt.text}
              </ThemedText>
              <IconButton
                icon="trash"
                label={`Delete ${promptTitle(prompt.text)}`}
                onPress={() => setDeleting(prompt)}
              />
            </View>
          </Fragment>
        ))
      ) : (
        <View style={[styles.lead, styles.padded]}>
          <Icon name="prompt" size={18} />
          <ThemedText type="small" themeColor="textSecondary" style={styles.grow}>
            Save what you ask agents often, like “Run the tests and fix what fails”: a tap above the
            field puts it back. Save one while writing, or add it here.
          </ThemedText>
        </View>
      )}
      <Divider />
      <View style={[styles.add, styles.padded]}>
        <TextField
          label="New prompt"
          value={draft}
          onChangeText={setDraft}
          placeholder="Commit, push and open a draft PR"
          hint="Kept like shortcuts, outside the encrypted vault, so leave secrets out"
          multiline
          maxLines={4}
        />
        <Button
          title="Add prompt"
          icon="add"
          variant="secondary"
          size="small"
          disabled={!draft.trim() || isSaved(draft, prompts)}
          onPress={() => {
            add(draft);
            setDraft('');
          }}
        />
      </View>
      {deleting ? (
        <ConfirmDialog
          title="Delete this prompt?"
          confirmTitle="Delete"
          onConfirm={() => {
            remove(deleting.id);
            setDeleting(null);
          }}
          onCancel={() => setDeleting(null)}>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={4}>
            {deleting.text}
          </ThemedText>
        </ConfirmDialog>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  lead: { flexDirection: 'row', gap: Spacing.two + 2 },
  padded: { padding: Spacing.three },
  grow: { flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.two,
    paddingLeft: Spacing.three,
    paddingRight: Spacing.three - 4,
  },
  add: { gap: Spacing.two },
});
