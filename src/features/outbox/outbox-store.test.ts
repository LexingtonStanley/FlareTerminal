import { clearMemoryStorage, readJson, writeJson } from '@/test-utils/memory-storage';

import type { HostFile } from './outbox';
import { KEEP_BYTES, KEEP_FILES, OutboxStore } from './outbox-store';

jest.mock('@/lib/storage', () => jest.requireActual('@/test-utils/memory-storage'));

beforeEach(() => clearMemoryStorage());

const file = (name: string, size = 10, modifiedAt = 1000): HostFile => ({
  name,
  kind: name.endsWith('.md') ? 'markdown' : 'html',
  size,
  modifiedAt,
});

describe('OutboxStore', () => {
  it('keeps a file and its text, newest first, across restarts', () => {
    const store = new OutboxStore();
    const plan = store.receive('devbox', 'Devbox', file('plan.md'), '# Plan', 5000);
    store.receive('devbox', 'Devbox', file('report.html'), '<p>Hi</p>', 6000);

    const restarted = new OutboxStore();
    expect(restarted.getSnapshot().map(({ name }) => name)).toEqual(['report.html', 'plan.md']);
    expect(restarted.get(plan.id)).toEqual({
      id: plan.id,
      connectionId: 'devbox',
      host: 'Devbox',
      name: 'plan.md',
      kind: 'markdown',
      size: 10,
      modifiedAt: 1000,
      receivedAt: 5000,
      read: false,
    });
    expect(restarted.text(plan.id)).toBe('# Plan');
  });

  it('knows which versions of a host’s files it has', () => {
    const store = new OutboxStore();
    store.receive('devbox', 'Devbox', file('plan.md', 10, 1000), '# Plan', 5000);

    expect(store.isNew('devbox', file('plan.md', 10, 1000))).toBe(false);
    expect(store.isNew('devbox', file('plan.md', 12, 1000))).toBe(true);
    expect(store.isNew('devbox', file('plan.md', 10, 2000))).toBe(true);
    // Another host's file of the same name is its own.
    expect(store.isNew('laptop', file('plan.md', 10, 1000))).toBe(true);
  });

  it('puts a newer version in the older one’s place, unread again', () => {
    const store = new OutboxStore();
    const first = store.receive('devbox', 'Devbox', file('plan.md', 6, 1000), '# Plan', 5000);
    store.receive('devbox', 'Devbox', file('notes.md'), 'notes', 5500);
    store.markRead(first.id);

    const second = store.receive('devbox', 'Devbox', file('plan.md', 9, 2000), '# Plan v2', 6000);

    expect(second.id).toBe(first.id);
    expect(store.getSnapshot().map(({ name, read }) => [name, read])).toEqual([
      ['plan.md', false],
      ['notes.md', false],
    ]);
    expect(store.text(first.id)).toBe('# Plan v2');
  });

  it('marks a file read', () => {
    const store = new OutboxStore();
    const { id } = store.receive('devbox', 'Devbox', file('plan.md'), '# Plan', 5000);
    const changes = jest.fn();
    store.subscribe(changes);

    store.markRead(id);
    store.markRead(id);

    expect(store.get(id)?.read).toBe(true);
    expect(changes).toHaveBeenCalledTimes(1);
  });

  it('deletes the phone’s copy without fetching the same version again', () => {
    const store = new OutboxStore();
    const { id } = store.receive('devbox', 'Devbox', file('plan.md'), '# Plan', 5000);

    store.remove(id);

    expect(store.getSnapshot()).toEqual([]);
    expect(store.text(id)).toBeNull();
    expect(store.isNew('devbox', file('plan.md'))).toBe(false);
  });

  it('forgets files that left the host, so one made again comes over', () => {
    const store = new OutboxStore();
    store.receive('devbox', 'Devbox', file('plan.md'), '# Plan', 5000);
    store.receive('devbox', 'Devbox', file('notes.md'), 'notes', 5000);

    store.keepSeen('devbox', [file('notes.md')]);

    expect(store.isNew('devbox', file('plan.md'))).toBe(true);
    expect(store.isNew('devbox', file('notes.md'))).toBe(false);
    expect(readJson('flare.outbox.seen.v1')).toEqual({ devbox: { 'notes.md': '1000:10' } });
  });

  it('lists a file too big to bring over, with no text', () => {
    const store = new OutboxStore();
    const big = store.receive('devbox', 'Devbox', file('huge.md', 9_000_000), null, 5000);

    expect(big.tooBig).toBe(true);
    expect(store.text(big.id)).toBeNull();
    expect(store.isNew('devbox', file('huge.md', 9_000_000))).toBe(false);
  });

  it('keeps the newest files, up to its limits', () => {
    const store = new OutboxStore();
    const first = store.receive('devbox', 'Devbox', file('0.md'), 'first', 0);
    for (let i = 1; i <= KEEP_FILES; i++) {
      store.receive('devbox', 'Devbox', file(`${i}.md`), `${i}`, i);
    }

    expect(store.getSnapshot()).toHaveLength(KEEP_FILES);
    expect(store.get(first.id)).toBeNull();
    expect(store.text(first.id)).toBeNull();

    // Past the bytes the phone keeps: the older files go, never the newest.
    const huge = store.receive('devbox', 'Devbox', file('huge.md', KEEP_BYTES + 1), 'x', 100);
    expect(store.getSnapshot()).toEqual([huge]);
  });

  it('skips stored files it can’t read', () => {
    writeJson('flare.outbox.v1', [
      { id: 'f1', name: 'plan.md' },
      {
        id: 'f2',
        connectionId: 'devbox',
        host: 'Devbox',
        name: 'plan.md',
        kind: 'markdown',
        size: 1,
        modifiedAt: 1,
        receivedAt: 1,
        read: true,
      },
    ]);

    expect(new OutboxStore().getSnapshot().map(({ id }) => id)).toEqual(['f2']);
  });
});
