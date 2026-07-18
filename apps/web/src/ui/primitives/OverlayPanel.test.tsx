// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudioDesignProvider } from '../StudioDesignProvider';
import { OverlayPanel } from './OverlayPanel';

afterEach(cleanup);

const Harness = ({ onClose = vi.fn() }: { onClose?: () => void }) => {
  const [open, setOpen] = useState(false);

  return (
    <StudioDesignProvider>
      <button type="button" onClick={() => setOpen(true)}>
        Open tools
      </button>
      <OverlayPanel
        open={open}
        title="Studio tools"
        description="Choose a contained tool."
        footer={<button type="button">Apply</button>}
        onClose={() => {
          onClose();
          setOpen(false);
        }}
      >
        <button type="button">First action</button>
      </OverlayPanel>
    </StudioDesignProvider>
  );
};

describe('OverlayPanel', () => {
  it('traps focus, closes with Escape, and restores the opener', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);

    const opener = screen.getByRole('button', { name: 'Open tools' });
    await user.click(opener);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Close panel' })).toHaveFocus());
    await user.keyboard('{Shift>}{Tab}{/Shift}');
    expect(screen.getByRole('button', { name: 'Apply' })).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it('closes only when the backdrop itself is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: 'Open tools' }));
    fireEvent.mouseDown(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();

    const backdrop = screen.getByRole('dialog').parentElement;
    expect(backdrop).not.toBeNull();
    if (backdrop) fireEvent.mouseDown(backdrop);
    expect(onClose).toHaveBeenCalledOnce();
  });
});
