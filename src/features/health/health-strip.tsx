import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import type { SessionSnapshot } from '@/features/sessions/session-manager';
import { usePreferences } from '@/features/settings/preferences-provider';
import { useShape, useTheme, useType } from '@/hooks/use-theme';

import {
  diskUsed,
  formatBytes,
  formatUptime,
  HIGH_USE,
  memoryUsed,
  percent,
  type HostHealth,
} from './health';
import { useHostHealth } from './use-host-health';

type Reading = { label: string; value: string; spoken: string; high: boolean };

function readingsOf({ load, cpus, memory, disk, uptime }: HostHealth): Reading[] {
  const readings: Reading[] = [];
  if (load) {
    // More runnable work than cores: things are queueing.
    const high = cpus !== null && load[0] > cpus;
    readings.push({
      label: 'load',
      value: load[0].toFixed(2),
      spoken: `load ${load[0].toFixed(2)}${cpus ? ` on ${cpus} cores` : ''}`,
      high,
    });
  }
  if (memory) {
    const used = memoryUsed(memory);
    readings.push({
      label: 'mem',
      value: percent(used),
      spoken: `memory ${percent(used)} used`,
      high: used >= HIGH_USE,
    });
  }
  if (disk) {
    const used = diskUsed(disk);
    readings.push({
      label: 'disk',
      value: percent(used),
      spoken: `disk ${percent(used)} used`,
      high: used >= HIGH_USE,
    });
  }
  if (uptime !== null) {
    readings.push({
      label: 'up',
      value: formatUptime(uptime),
      spoken: `up ${formatUptime(uptime)}`,
      high: false,
    });
  }
  return readings;
}

/** The longer version, shown on a tap: all three loads, cores, and sizes. */
function detailsOf({ load, cpus, memory, disk }: HostHealth): string {
  return (
    [
      load && `load ${load.map((value) => value.toFixed(2)).join(' ')}`,
      cpus && `${cpus} ${cpus === 1 ? 'core' : 'cores'}`,
      memory &&
        `mem ${formatBytes(memory.total - memory.available)} of ${formatBytes(memory.total)}`,
      disk && `disk ${formatBytes(disk.used)} of ${formatBytes(disk.total)}`,
    ]
      .filter((item) => typeof item === 'string')
      // Lines break between readings, never inside one ("16 GB").
      .map((item) => item.replace(/ /g, '\u00a0'))
      .join(' · ')
  );
}

/**
 * The session's host health while it's connected and the setting is on. Its own component,
 * so a reading every 10 seconds re-renders the strip, not the session screen.
 */
export function SessionHealthStrip({ session }: { session: SessionSnapshot }) {
  const { hostHealth } = usePreferences();
  const health = useHostHealth(session, hostHealth);
  return health ? <HealthStrip health={health} /> : null;
}

/**
 * One line of the host's health above the terminal: load, memory, disk, uptime. Readings
 * that deserve a look (nearly full, more load than cores) turn red. A tap shows more.
 */
export function HealthStrip({ health }: { health: HostHealth }) {
  const theme = useTheme();
  const { hairline } = useShape();
  const { mono } = useType();
  const [expanded, setExpanded] = useState(false);
  const readings = readingsOf(health);
  const high = readings.filter((reading) => reading.high);

  return (
    <Pressable
      role="button"
      aria-label={`Host health: ${readings.map(({ spoken }) => spoken).join(', ')}${
        high.length ? `. High: ${high.map(({ label }) => label).join(', ')}` : ''
      }`}
      aria-expanded={expanded}
      onPress={() => setExpanded((open) => !open)}
      style={({ pressed }) => [
        styles.bar,
        {
          backgroundColor: pressed ? theme.backgroundSelected : theme.background,
          borderColor: theme.border,
          borderBottomWidth: hairline,
        },
      ]}>
      <View style={styles.readings}>
        {readings.map(({ label, value, high }) => (
          <Text
            key={label}
            numberOfLines={1}
            style={[styles.text, mono(), { color: theme.textSecondary }]}>
            {label}{' '}
            <Text style={[mono(500), { color: high ? theme.danger : theme.text }]}>{value}</Text>
          </Text>
        ))}
      </View>
      {expanded ? (
        <Text style={[styles.text, mono(), { color: theme.textSecondary }]}>
          {detailsOf(health)}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    gap: Spacing.half,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one + 2,
  },
  readings: { flexDirection: 'row', flexWrap: 'wrap', columnGap: Spacing.three },
  text: { fontSize: 12, lineHeight: 16 },
});
