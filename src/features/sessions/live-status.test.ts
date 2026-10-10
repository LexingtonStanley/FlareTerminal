import { liveStatus, type LiveSession } from './live-status';

const NOW = 10_000_000;
const MINUTE = 60_000;

function session(name: string, rest: Partial<LiveSession> = {}): LiveSession {
  return {
    name,
    status: { state: 'connected' },
    attention: null,
    prompt: null,
    reconnecting: false,
    workingSince: null,
    hidden: false,
    ...rest,
  };
}

const asking = (name: string, question: string, rest: Partial<LiveSession> = {}) =>
  session(name, {
    prompt: { question, at: NOW - MINUTE, answers: [] } as unknown as LiveSession['prompt'],
    ...rest,
  });

const finished = (name: string, body: string, rest: Partial<LiveSession> = {}) =>
  session(name, {
    attention: { title: `${name} finished`, body, at: NOW - MINUTE, kind: 'finished' },
    ...rest,
  });

const working = (name: string, minutes: number, rest: Partial<LiveSession> = {}) =>
  session(name, { workingSince: NOW - minutes * MINUTE, ...rest });

describe('liveStatus', () => {
  it('is null with no session open', () => {
    expect(liveStatus([], NOW)).toBeNull();
    expect(
      liveStatus([session('Box', { status: { state: 'closed', message: 'Logged out' } })], NOW)
    ).toBeNull();
  });

  it('counts the sessions when no agent is doing anything', () => {
    expect(liveStatus([session('Box'), session('Pi', { reconnecting: true })], NOW)).toEqual({
      title: 'Flare Terminal',
      text: '2 sessions connected',
    });
  });

  it('says how long an agent has been working', () => {
    expect(liveStatus([working('Janus', 12), session('Box')], NOW)).toEqual({
      title: 'Janus is working',
      text: 'For 12m',
    });
    expect(liveStatus([working('Janus', 0)], NOW)?.text).toBe('Just started');
    expect(liveStatus([working('Janus', 12), working('Hermes', 3)], NOW)).toEqual({
      title: '2 agents working',
      text: 'Janus 12m, Hermes 3m',
    });
  });

  it('leaves out an agent that lost its connection', () => {
    expect(
      liveStatus([working('Janus', 12, { status: { state: 'connecting' } })], NOW)?.title
    ).toBe('Flare Terminal');
  });

  it('puts what needs you first, with the rest after it', () => {
    expect(
      liveStatus(
        [
          working('Hermes', 3),
          asking('Janus', 'Do you want to make this edit?'),
          finished('Pi', 'Done'),
        ],
        NOW
      )
    ).toEqual({
      title: 'Janus needs you',
      text: 'Do you want to make this edit? · Hermes working 3m · 1 finished',
    });
    expect(
      liveStatus(
        [
          asking('Janus', 'Proceed?'),
          asking('Hermes', 'Allow Bash?'),
          working('Pi', 1),
          working('Ada', 2),
        ],
        NOW
      )
    ).toEqual({ title: '2 sessions need you', text: 'Janus, Hermes · 2 working' });
  });

  it('says when an agent finished, with its last line', () => {
    expect(liveStatus([finished('Janus', 'All 41 tests pass.')], NOW)).toEqual({
      title: 'Janus finished',
      text: 'All 41 tests pass.',
    });
    expect(liveStatus([finished('Janus', 'a'), finished('Hermes', 'b')], NOW)).toEqual({
      title: '2 agents finished',
      text: 'Janus, Hermes',
    });
  });

  it('keeps protected sessions’ names and screens out of it', () => {
    const hidden = { hidden: true };
    expect(liveStatus([asking('Acquisition', 'Delete the data room?', hidden)], NOW)).toEqual({
      title: 'A session needs you',
      text: '',
    });
    expect(
      liveStatus([asking('Acquisition', 'Delete?', hidden), asking('Janus', 'Proceed?')], NOW)
    ).toEqual({ title: '2 sessions need you', text: 'Janus' });
    expect(liveStatus([working('Acquisition', 5, hidden)], NOW)).toEqual({
      title: 'An agent is working',
      text: 'For 5m',
    });
    expect(
      liveStatus([asking('Janus', 'Proceed?'), working('Acquisition', 5, hidden)], NOW)
    ).toEqual({
      title: 'Janus needs you',
      text: 'Proceed? · 1 working',
    });
    expect(liveStatus([finished('Acquisition', 'Sent the wire.', hidden)], NOW)).toEqual({
      title: 'An agent finished',
      text: '',
    });
  });
});
