/**
 * @jest-environment node
 */
import { keepSessionsAlive } from './background.android';

type FakeService = {
  running: boolean;
  calls: string[];
};

jest.mock('react-native-background-actions', () => {
  const fake = {
    running: false,
    calls: [] as string[],
    isRunning: () => fake.running,
    async start(_task: () => Promise<void>, options: { taskDesc: string }) {
      fake.running = true;
      fake.calls.push(`start: ${options.taskDesc}`);
    },
    async updateNotification({ taskDesc }: { taskDesc: string }) {
      fake.calls.push(`update: ${taskDesc}`);
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

it('runs the foreground service while sessions are live, in order', async () => {
  keepSessionsAlive(0);
  keepSessionsAlive(1);
  keepSessionsAlive(2);
  keepSessionsAlive(0);
  keepSessionsAlive(1);
  await settled();

  expect(service.calls).toEqual([
    'start: 1 session connected',
    'update: 2 sessions connected',
    'stop',
    'start: 1 session connected',
  ]);
});
