import { fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';

import type { SpecialKey } from '@/features/terminal/keys';

import { AccessoryBar } from './accessory-bar';
import { CodingKeyboard } from './coding-keyboard';
import { placeKeys } from './geometry';
import { SURFACE_PADDING } from './key-surface';
import { BAR_ROWS, keyboardRows, type LayerId, type Row } from './layout';
import { MODIFIERS_OFF, type ModifierState } from './modifiers';

const WIDTH = 390;

type Sent = { text?: string; key?: SpecialKey };

/** Renders a keyboard with real modifier state, recording what it sends. */
async function renderKeyboard(kind: 'bar' | 'keyboard') {
  const sent: Sent[] = [];
  const switches: string[] = [];

  function Harness() {
    const [modifiers, setModifiers] = useState<ModifierState>(MODIFIERS_OFF);
    const props = {
      modifiers,
      onModifiersChange: setModifiers,
      onKey: (key: SpecialKey) => sent.push({ key }),
      onText: (text: string) => sent.push({ text }),
    };
    return kind === 'bar' ? (
      <AccessoryBar {...props} onOpenKeyboard={() => switches.push('coding')} />
    ) : (
      <CodingKeyboard {...props} onUseSystemKeyboard={() => switches.push('system')} />
    );
  }

  await render(<Harness />);
  // The surface isn't an accessibility element itself (that would hide its keys from
  // VoiceOver), so it's found by its label rather than its role.
  const surface = screen.getByLabelText(kind === 'bar' ? 'Terminal keys' : 'Coding keyboard');
  await fireEvent.layout(surface, { x: 0, y: 0, width: WIDTH, height: 300 });
  return { surface, sent, switches };
}

function centerOf(rows: Row[], name: string) {
  const placed = placeKeys(rows, WIDTH, SURFACE_PADDING.top).find((item) => item.key.name === name);
  if (!placed) throw new Error(`No key named ${name}`);
  const { x, y, width, height } = placed.rect;
  return { x: x + width / 2, y: y + height / 2 };
}

function touchEvent(id: number, point: { x: number; y: number }, down: boolean) {
  const touch = { identifier: id, locationX: point.x, locationY: point.y };
  return { nativeEvent: { changedTouches: [touch], touches: down ? [touch] : [] } };
}

/** A finger on the surface: down on a key, optionally a move, then up. */
async function swipe(
  surface: ReturnType<typeof screen.getByRole>,
  rows: Row[],
  name: string,
  { dx = 0, dy = 0 } = {}
) {
  const start = centerOf(rows, name);
  const end = { x: start.x + dx, y: start.y + dy };
  await fireEvent(surface, 'responderStart', touchEvent(1, start, true));
  if (dx || dy) await fireEvent(surface, 'responderMove', touchEvent(1, end, true));
  await fireEvent(surface, 'responderEnd', touchEvent(1, end, false));
  await fireEvent(surface, 'responderRelease', touchEvent(1, end, false));
}

const rowsFor = (layer: LayerId) => keyboardRows(layer);

describe('AccessoryBar', () => {
  it('sends Escape, and Shift+Tab with a flick up on Tab', async () => {
    const { surface, sent } = await renderKeyboard('bar');

    await swipe(surface, BAR_ROWS, 'Escape');
    await swipe(surface, BAR_ROWS, 'Tab', { dy: -30 });

    expect(sent).toEqual([{ key: 'escape' }, { key: 'shift-tab' }]);
  });

  it('sends the symbol a flick points at', async () => {
    const { surface, sent } = await renderKeyboard('bar');

    await swipe(surface, BAR_ROWS, 'Pipe', { dx: 30 });
    await swipe(surface, BAR_ROWS, 'Slash', { dy: -30 });

    expect(sent).toEqual([{ text: '>' }, { text: '\\' }]);
  });

  it('shows Ctrl armed after a tap and locked after a double tap', async () => {
    const { surface } = await renderKeyboard('bar');
    const ctrl = screen.getByRole('switch', { name: 'Control' });

    await swipe(surface, BAR_ROWS, 'Control');
    expect(ctrl).toBeChecked();
    expect(ctrl).toHaveAccessibilityValue({ text: 'once' });

    await swipe(surface, BAR_ROWS, 'Control');
    expect(ctrl).toHaveAccessibilityValue({ text: 'locked' });

    await swipe(surface, BAR_ROWS, 'Control');
    expect(ctrl).not.toBeChecked();
  });

  it('works from a screen reader: activate and flick actions', async () => {
    const { sent } = await renderKeyboard('bar');

    await fireEvent(screen.getByRole('button', { name: 'Tab' }), 'accessibilityAction', {
      nativeEvent: { actionName: 'up' },
    });
    await fireEvent(screen.getByRole('button', { name: 'Arrow keys' }), 'accessibilityAction', {
      nativeEvent: { actionName: 'page-up' },
    });
    await fireEvent(screen.getByRole('switch', { name: 'Alt' }), 'accessibilityAction', {
      nativeEvent: { actionName: 'activate' },
    });

    expect(sent).toEqual([{ key: 'shift-tab' }, { key: 'page-up' }]);
    expect(screen.getByRole('switch', { name: 'Alt' })).toBeChecked();
  });

  it('opens the coding keyboard', async () => {
    const { surface, switches } = await renderKeyboard('bar');

    await swipe(surface, BAR_ROWS, 'Coding keyboard');

    expect(switches).toEqual(['coding']);
  });
});

describe('CodingKeyboard', () => {
  it('types letters, a flicked digit, a space and Enter', async () => {
    const { surface, sent } = await renderKeyboard('keyboard');
    const rows = rowsFor('letters');

    await swipe(surface, rows, 'l');
    await swipe(surface, rows, 's');
    await swipe(surface, rows, 'Space');
    await swipe(surface, rows, 'w', { dy: -30 });
    await swipe(surface, rows, 'Enter');

    expect(sent).toEqual([
      { text: 'l' },
      { text: 's' },
      { text: ' ' },
      { text: '2' },
      { key: 'enter' },
    ]);
  });

  it('capitalises one letter after Shift, and shows capitals while it is on', async () => {
    const { surface, sent } = await renderKeyboard('keyboard');
    const rows = rowsFor('letters');

    await swipe(surface, rows, 'Shift');
    expect(screen.getByRole('switch', { name: 'Shift' })).toBeChecked();
    expect(screen.getByText('G')).toBeOnTheScreen();

    await swipe(surface, rows, 'g');
    await swipe(surface, rows, 'g');

    expect(sent).toEqual([{ text: 'G' }, { text: 'g' }]);
    expect(screen.getByRole('switch', { name: 'Shift' })).not.toBeChecked();
  });

  it('applies sticky Ctrl through the session: Ctrl, then c', async () => {
    const { surface, sent } = await renderKeyboard('keyboard');
    const rows = rowsFor('letters');

    await swipe(surface, rows, 'Control');
    await swipe(surface, rows, 'c');

    // The keyboard sends plain text; the session applies the armed Ctrl.
    expect(sent).toEqual([{ text: 'c' }]);
    expect(screen.getByRole('switch', { name: 'Control' })).toBeChecked();
  });

  it('switches to symbols and navigation keys and back', async () => {
    const { surface, sent } = await renderKeyboard('keyboard');

    await swipe(surface, rowsFor('letters'), 'Symbols');
    await swipe(surface, rowsFor('symbols'), 'Left brace');
    await swipe(surface, rowsFor('symbols'), 'Navigation keys');
    await swipe(surface, rowsFor('nav'), 'Page down');
    await swipe(surface, rowsFor('nav'), 'F5');
    await swipe(surface, rowsFor('nav'), 'Letters');

    expect(sent).toEqual([{ text: '{' }, { key: 'page-down' }, { key: 'f5' }]);
    expect(screen.getByRole('button', { name: 'q' })).toBeOnTheScreen();
  });

  it('moves the cursor by sliding along the space bar', async () => {
    const { surface, sent } = await renderKeyboard('keyboard');

    await swipe(surface, rowsFor('letters'), 'Space', { dx: -40 });

    expect(sent).toEqual([{ key: 'left' }, { key: 'left' }, { key: 'left' }]);
  });

  it('has Home and End beside space, and Delete a flick right on backspace', async () => {
    const { surface, sent } = await renderKeyboard('keyboard');

    await swipe(surface, rowsFor('letters'), 'Home');
    await swipe(surface, rowsFor('letters'), 'End');
    await swipe(surface, rowsFor('letters'), 'Backspace', { dx: 30 });
    await swipe(surface, rowsFor('letters'), 'Backspace');

    expect(sent).toEqual([
      { key: 'home' },
      { key: 'end' },
      { key: 'delete' },
      { key: 'backspace' },
    ]);
  });

  it('switches to the phone keyboard', async () => {
    const { surface, switches } = await renderKeyboard('keyboard');

    await swipe(surface, rowsFor('letters'), 'Phone keyboard');

    expect(switches).toEqual(['system']);
  });
});
