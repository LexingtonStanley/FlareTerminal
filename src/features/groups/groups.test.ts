import type { Connection } from '@/features/connections/connections';

import { protectionScope, validateGroup, type Group } from './groups';

const WORK: Group = { id: 'work', name: 'Work', protected: false };
const PROD: Group = { id: 'prod', name: 'Prod', protected: true };
const box = (changes: Partial<Connection> = {}): Connection =>
  ({
    id: 'box',
    kind: 'ssh',
    name: 'Box',
    host: 'box',
    port: 22,
    username: 'ada',
    ...changes,
  }) as Connection;

describe('protectionScope', () => {
  it('is null for a connection nothing protects', () => {
    expect(protectionScope(box(), [WORK])).toBeNull();
    expect(protectionScope(box({ groupId: 'work' }), [WORK])).toBeNull();
  });

  it('covers the connection when only it is protected', () => {
    expect(protectionScope(box({ protected: true }), [WORK])).toBe('connection:box');
  });

  it('covers the whole group when the group is protected', () => {
    expect(protectionScope(box({ groupId: 'prod' }), [PROD])).toBe('group:prod');
    expect(protectionScope(box({ groupId: 'prod', protected: true }), [PROD])).toBe('group:prod');
  });

  it('ignores a group that was deleted', () => {
    expect(protectionScope(box({ groupId: 'gone', protected: true }), [])).toBe('connection:box');
  });

  it('puts a connection behind its jump host’s lock', () => {
    const bastion = box({ id: 'bastion', groupId: 'prod' });
    const inner = box({ id: 'inner', jumpId: 'bastion', protected: true });
    const db = box({ id: 'db', jumpId: 'inner' });
    const all = [bastion, inner, db];

    // The nearest protected one: inner, then bastion's group.
    expect(protectionScope(db, [PROD], all)).toBe('connection:inner');
    expect(protectionScope(box({ id: 'web', jumpId: 'bastion' }), [PROD], all)).toBe('group:prod');
    // Its own protection comes first.
    expect(protectionScope(box({ id: 'x', jumpId: 'inner', groupId: 'prod' }), [PROD], all)).toBe(
      'group:prod'
    );
    expect(protectionScope(box({ id: 'y', jumpId: 'gone' }), [PROD], all)).toBeNull();
  });
});

describe('validateGroup', () => {
  it('wants a name no other group has', () => {
    expect(validateGroup({ name: ' ', protected: false }, [])).toBe(
      'Give the group a name, e.g. Work'
    );
    expect(validateGroup({ name: 'work', protected: false }, [WORK])).toBe(
      'There is already a group with this name'
    );
    expect(validateGroup({ name: 'Home', protected: false }, [WORK])).toBeNull();
  });
});
