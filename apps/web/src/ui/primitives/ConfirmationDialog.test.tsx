// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudioDesignProvider } from '../StudioDesignProvider';
import { ConfirmationDialog } from './ConfirmationDialog';
import { OverlayPanel } from './OverlayPanel';

afterEach(() => {
  cleanup();
  document.body.style.removeProperty('overflow');
});

const StackedDialogHarness = ({
  onParentClose,
  onCancel,
}: {
  readonly onParentClose: () => void;
  readonly onCancel: () => void;
}) => {
  const [parentOpen, setParentOpen] = useState(false);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const confirmationInvokerRef = useRef<HTMLButtonElement>(null);

  return (
    <StudioDesignProvider>
      <button type="button" onClick={() => setParentOpen(true)}>
        Open manager
      </button>
      <OverlayPanel
        open={parentOpen}
        title="Legacy projects"
        onClose={() => {
          onParentClose();
          setParentOpen(false);
        }}
      >
        <button
          ref={confirmationInvokerRef}
          type="button"
          onClick={() => setConfirmationOpen(true)}
        >
          Delete selected project
        </button>
      </OverlayPanel>
      <ConfirmationDialog
        open={confirmationOpen}
        title="Delete selected project?"
        description="This action cannot be undone."
        confirmLabel="Delete permanently"
        cancelLabel="Keep project"
        returnFocusRef={confirmationInvokerRef}
        onCancel={() => {
          onCancel();
          setConfirmationOpen(false);
        }}
        onConfirm={() => setConfirmationOpen(false)}
      />
    </StudioDesignProvider>
  );
};

describe('ConfirmationDialog', () => {
  it('keeps Cancel initially focused and exposes the optional middle action', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const onSecondary = vi.fn();
    const onConfirm = vi.fn();
    render(
      <StudioDesignProvider>
        <ConfirmationDialog
          open
          title="Replace the current video?"
          description="Choose whether to download the current source first."
          confirmLabel="Download Original and Replace"
          cancelLabel="Cancel"
          secondaryAction={{
            label: 'Replace Without Downloading',
            onAction: onSecondary,
          }}
          onCancel={onCancel}
          onConfirm={onConfirm}
        />
      </StudioDesignProvider>,
    );

    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus());
    await user.click(screen.getByRole('button', { name: 'Replace Without Downloading' }));
    expect(onSecondary).toHaveBeenCalledOnce();
    expect(onCancel).not.toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('takes topmost focus, dismisses only itself, and restores the exact invoking control', async () => {
    const user = userEvent.setup();
    const onParentClose = vi.fn();
    const onCancel = vi.fn();
    render(<StackedDialogHarness onParentClose={onParentClose} onCancel={onCancel} />);

    await user.click(screen.getByRole('button', { name: 'Open manager' }));
    const invoker = screen.getByRole('button', { name: 'Delete selected project' });
    const parentDialog = screen
      .getByRole('heading', { name: 'Legacy projects' })
      .closest<HTMLElement>('[role="dialog"]');
    expect(parentDialog).not.toBeNull();
    await user.click(invoker);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Keep project' })).toHaveFocus());
    expect(parentDialog).toHaveAttribute('aria-hidden', 'true');
    expect(parentDialog).toHaveAttribute('inert');

    await user.keyboard('{Escape}');

    expect(onCancel).toHaveBeenCalledOnce();
    expect(onParentClose).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Delete selected project?' }),
      ).not.toBeInTheDocument(),
    );
    expect(parentDialog).not.toHaveAttribute('aria-hidden');
    expect(parentDialog).not.toHaveAttribute('inert');
    expect(invoker).toHaveFocus();
  });
});
