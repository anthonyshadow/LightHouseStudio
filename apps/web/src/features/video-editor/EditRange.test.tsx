// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudioDesignProvider } from '../../ui';
import { EditRange } from './EditRange';

afterEach(cleanup);

const renderRange = (disabled: boolean) => {
  const onStart = vi.fn();
  const onCommit = vi.fn();
  render(
    <StudioDesignProvider>
      <EditRange
        label="Clip volume"
        value={50}
        minimum={0}
        maximum={100}
        onStart={onStart}
        onChange={() => undefined}
        onCommit={onCommit}
        disabled={disabled}
      />
    </StudioDesignProvider>,
  );
  return { onStart, onCommit, input: screen.getByRole('slider', { name: 'Clip volume' }) };
};

describe('EditRange', () => {
  it('opens a gesture on first contact when it is live', () => {
    const { onStart, input } = renderRange(false);
    fireEvent.pointerDown(input);
    expect(onStart).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(input, { key: 'ArrowRight' });
    expect(onStart).toHaveBeenCalledTimes(2);
  });

  it('opens no gesture while disabled, so nothing is left waiting for a release that never comes', () => {
    const { onStart, onCommit, input } = renderRange(true);
    expect(input).toBeDisabled();
    // A disabled control still receives pointer events; the openers must not answer them.
    fireEvent.pointerDown(input);
    fireEvent.keyDown(input, { key: 'ArrowRight' });
    expect(onStart).not.toHaveBeenCalled();
    // The closers stay live, and closing nothing is harmless.
    fireEvent.pointerUp(input);
    expect(onCommit).toHaveBeenCalledTimes(1);
  });
});
