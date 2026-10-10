/**
 * @jest-environment node
 */
import { keepSessionsAlive } from './background.android';

type FakeService = {
  running: boolean;
  calls: string[];
};

jest.mock('expo-linking', () => ({
  createURL: (path: string) => `flareterminal://${path.replace(/^\//, '')}`,
}));

jest.mock('react-native-background-actions', () => {
  const fake = {
    running: false,
    calls: [] as string[],
    isRunning: () => fake.running,
    async start(
      _task: () => Promise<void>,
      options: { taskTitle: string; taskDesc: string; linkingURI: string }
    ) {
      fake.running = true;
      fake.calls.push(`start: ${options.taskTitle} | ${options.taskDesc} → ${options.linkingURI}`);
    },
    async updateNotification({ taskTitle, taskDesc }: { taskTitle: string; taskDesc: string }) {
      fake.calls.push(`update: ${taskTitle} | ${taskDesc}`);
    },
    async stop() {
      fake.running = false;
      fake.calls.push('stop');
    },
  };
  return { __esModule: true, default: fake };
});

const service = jest.requireMock<{ default: FakeService }>(
  'react-native-background-actions'
).default;
const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

const working = { title: 'Janus is working', text: 'For 12m' };
const needs = { title: 'Janus needs you', text: 'Do you want to make this edit?' };

it('runs the foreground service while sessions are open, its notification the status', async () => {
  keepSessionsAlive(null);
  keepSessionsAlive(working);
  keepSessionsAlive({ ...working });
  keepSessionsAlive(needs);
  keepSessionsAlive(null);
  keepSessionsAlive(working);
  await settled();

  expect(service.calls).toEqual([
    // The channel is named after what it starts with, so that stays the same.
    'start: Flare Terminal | Keeps your sessions connected → flareterminal://inbox',
    'update: Janus is working | For 12m',
    'update: Janus needs you | Do you want to make this edit?',
    'stop',
    'start: Flare Terminal | Keeps your sessions connected → flareterminal://inbox',
    'update: Janus is working | For 12m',
  ]);
});
