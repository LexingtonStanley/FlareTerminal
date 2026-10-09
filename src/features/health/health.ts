/**
 * A host's health (load, memory, disk, uptime), read by a small sh script the session runs
 * beside the terminal. Nothing is installed on the host: the script reads /proc on Linux
 * and sysctl/vm_stat on macOS, prints a block of `name value…` lines, and repeats.
 */

export type HostHealth = {
  /** Load averages over 1, 5 and 15 minutes. */
  load: [number, number, number] | null;
  cpus: number | null;
  /** Bytes. */
  memory: { total: number; available: number } | null;
  /** The disk holding the home directory, in bytes. */
  disk: { total: number; used: number; available: number } | null;
  /** Seconds since the host started. */
  uptime: number | null;
};

/** Seconds between readings. */
export const HEALTH_INTERVAL = 10;

/**
 * Runs with `sh -s`, so it reads the same whatever the login shell (fish, zsh, csh). awk
 * only passes numbers through as text: old mawk prints large ones wrong.
 */
export const HEALTH_SCRIPT = `export LC_ALL=C
while :; do
  if [ -r /proc/loadavg ]; then
    read l1 l5 l15 rest < /proc/loadavg; echo "load $l1 $l5 $l15"
    read up rest < /proc/uptime; echo "uptime $up"
    echo "cpus $(getconf _NPROCESSORS_ONLN 2>/dev/null || nproc 2>/dev/null)"
    awk '/^MemTotal:/ { t = $2 } /^MemAvailable:/ { a = $2 } END { print "memkb", t, a }' /proc/meminfo
  else
    echo "load $(sysctl -n vm.loadavg 2>/dev/null | tr -d '{}')"
    boot=$(sysctl -n kern.boottime 2>/dev/null | sed -n 's/^{ sec = \\([0-9]*\\).*/\\1/p')
    [ -n "$boot" ] && echo "uptime $(( $(date +%s) - boot ))"
    echo "cpus $(sysctl -n hw.ncpu 2>/dev/null)"
    vm_stat 2>/dev/null | awk -v total="$(sysctl -n hw.memsize 2>/dev/null)" '
      /page size of/ { size = $8 }
      /^Pages (free|inactive|speculative|purgeable):/ { sub(/\\./, "", $NF); free += $NF }
      END { print "mempages", total, free, size }'
  fi
  df -Pk "$HOME" 2>/dev/null | awk 'NR == 2 { print "diskkb", $2, $3, $4 }'
  echo end
  sleep ${HEALTH_INTERVAL} || exit
done
`;

const KIB = 1024;

/** Reads one block of the script's output; null when it says nothing useful. */
export function parseHealth(block: string): HostHealth | null {
  const health: HostHealth = { load: null, cpus: null, memory: null, disk: null, uptime: null };
  for (const line of block.split('\n')) {
    const [name, ...fields] = line.trim().split(/\s+/);
    const values = fields.map(Number);
    const valid = (count: number) =>
      values.length >= count && values.slice(0, count).every((value) => Number.isFinite(value));
    if (name === 'load' && valid(3)) {
      health.load = [values[0], values[1], values[2]];
    } else if (name === 'uptime' && valid(1)) {
      health.uptime = values[0];
    } else if (name === 'cpus' && valid(1) && values[0] > 0) {
      health.cpus = values[0];
    } else if (name === 'memkb' && valid(2) && values[0] > 0) {
      health.memory = { total: values[0] * KIB, available: values[1] * KIB };
    } else if (name === 'mempages' && valid(3) && values[0] > 0) {
      health.memory = { total: values[0], available: values[1] * values[2] };
    } else if (name === 'diskkb' && valid(3) && values[0] > 0) {
      health.disk = { total: values[0] * KIB, used: values[1] * KIB, available: values[2] * KIB };
    }
  }
  const { load, memory, disk, uptime } = health;
  return load || memory || disk || uptime !== null ? health : null;
}

/**
 * Splits the script's streamed output into blocks; `onHealth` hears each reading. Push
 * text as it arrives, in any pieces.
 */
export function healthReader(onHealth: (health: HostHealth) => void) {
  let pending = '';
  return (text: string) => {
    pending += text;
    let end;
    while ((end = pending.search(/^end\r?$/m)) !== -1) {
      const block = pending.slice(0, end);
      pending = pending.slice(end).replace(/^end\r?\n?/, '');
      const health = parseHealth(block);
      if (health) onHealth(health);
    }
    // A host that prints without end lines (not sh): don't keep it all.
    if (pending.length > 64 * 1024) pending = '';
  };
}

/** Memory or disk in use, as a fraction (df's "Use%" for a disk). */
export function memoryUsed({ total, available }: NonNullable<HostHealth['memory']>) {
  return Math.min(1, Math.max(0, 1 - available / total));
}

export function diskUsed({ used, available }: NonNullable<HostHealth['disk']>) {
  return used + available > 0 ? used / (used + available) : 0;
}

/** When a reading deserves a second look: nearly full, or more load than cores. */
export const HIGH_USE = 0.9;

export function percent(fraction: number) {
  return `${Math.round(fraction * 100)}%`;
}

/** "42m", "5h", "3d". */
export function formatUptime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

/** Bytes as GB (powers of 1024, as df -h and Activity Monitor count): "6.9 GB", "15 GB". */
export function formatBytes(bytes: number) {
  const gb = bytes / KIB ** 3;
  if (gb >= 1) return `${gb >= 10 ? Math.round(gb) : gb.toFixed(1)} GB`;
  return `${Math.round(bytes / KIB ** 2)} MB`;
}
