import { render, screen, userEvent } from '@testing-library/react-native';

import { Button } from './button';

describe('Button', () => {
  it('calls onPress', async () => {
    const user = userEvent.setup();
    const onPress = jest.fn();
    await render(<Button title="Save" onPress={onPress} />);

    await user.press(screen.getByRole('button', { name: 'Save' }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('is busy and ignores presses while loading', async () => {
    const user = userEvent.setup();
    const onPress = jest.fn();
    await render(<Button title="Save" onPress={onPress} loading />);

    const button = screen.getByRole('button', { name: 'Save' });
    await user.press(button);

    expect(button).toBeBusy();
    expect(button).toBeDisabled();
    expect(onPress).not.toHaveBeenCalled();
  });
});
