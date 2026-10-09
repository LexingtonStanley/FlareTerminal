import { useRouter } from 'expo-router';
import { Fragment } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card, Divider } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { secretsSupported } from '@/lib/secrets';

import { APP_KEY_ID } from './keys';
import { useKeys } from './keys-provider';

/** Settings card listing the person's SSH keys, with ways to add one. */
export function KeysCard() {
  const theme = useTheme();
  const router = useRouter();
  const { keys, createAppKey } = useKeys();
  const open = (id: string) => router.push({ pathname: '/keys/[id]', params: { id } });

  if (!secretsSupported) {
    return (
      <Card>
        <View style={styles.lead}>
          <Icon name="key" size={18} />
          <ThemedText type="small" themeColor="textSecondary" style={styles.grow}>
            SSH keys live in the Android and iOS apps.
          </ThemedText>
        </View>
      </Card>
    );
  }

  return (
    <Card flush>
      {keys.length ? (
        keys.map((key, index) => (
          <Fragment key={key.id}>
            {index ? <Divider inset={Spacing.three} /> : null}
            <Pressable
              role="button"
              aria-label={`${key.name}, ${key.kind}`}
              onPress={() => open(key.id)}
              style={({ pressed }) => [
                styles.row,
                pressed && { backgroundColor: theme.backgroundSelected },
              ]}>
              <Icon name="key" size={18} color="text" />
              <View style={styles.grow}>
                <ThemedText type="smallBold" numberOfLines={1}>
                  {key.name}
                </ThemedText>
                <ThemedText type="code" themeColor="textSecondary" numberOfLines={1}>
                  {key.kind} · {key.fingerprint.replace('SHA256:', '').slice(0, 12)}…
                </ThemedText>
              </View>
              <Icon name="chevron" size={16} />
            </Pressable>
          </Fragment>
        ))
      ) : (
        <View style={[styles.lead, styles.padded]}>
          <Icon name="key" size={18} />
          <ThemedText type="small" themeColor="textSecondary" style={styles.grow}>
            Optional. With a key, computers that list it sign you in without a password. Import the
            keys you already use, or make one here. Private keys never leave this phone.
          </ThemedText>
        </View>
      )}
      <Divider />
      <View style={[styles.actions, styles.padded]}>
        <Button
          title="Import a key"
          icon="add"
          variant="secondary"
          size="small"
          onPress={() => router.push('/keys/new')}
        />
        {keys.some(({ id }) => id === APP_KEY_ID) ? null : (
          <Button
            title="Create a Flare key"
            icon="key"
            variant="secondary"
            size="small"
            onPress={() => open(createAppKey().id)}
          />
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  lead: { flexDirection: 'row', gap: Spacing.two + 2 },
  padded: { padding: Spacing.three },
  grow: { flex: 1, gap: Spacing.half },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.three - 4,
    paddingLeft: Spacing.three,
    paddingRight: Spacing.three - 4,
  },
  actions: { gap: Spacing.two },
});
