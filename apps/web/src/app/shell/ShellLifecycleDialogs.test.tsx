// @vitest-environment jsdom

import { createRef, type ComponentProps } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudioDesignProvider } from '../../ui';
import { ShellLifecycleDialogs } from './ShellLifecycleDialogs';

type DialogProps = ComponentProps<typeof ShellLifecycleDialogs>;

const idleLogout: DialogProps['logout'] = {
  promptOpen: false,
  blockedOpen: false,
  busy: false,
  preparing: false,
  failure: null,
  hasProjectProposal: false,
  request: vi.fn(),
  dismissPrompt: vi.fn(),
  dismissBlocked: vi.fn(),
  confirmDiscard: vi.fn(),
};

const idleExpiry: DialogProps['sessionExpiry'] = {
  noticeOpen: false,
  hasActiveWork: false,
  hasProjectProposal: false,
  busy: false,
  acknowledge: vi.fn(),
};

const dialogProps = (overrides: Partial<DialogProps> = {}): DialogProps => ({
  mainRef: createRef<HTMLElement>(),
  confirmation: { pending: null, ask: vi.fn(), confirm: vi.fn(), cancel: vi.fn() },
  logout: idleLogout,
  sessionExpiry: idleExpiry,
  ...overrides,
});

const renderDialogs = (props: DialogProps) =>
  render(
    <StudioDesignProvider>
      <main ref={props.mainRef}>
        <ShellLifecycleDialogs {...props} />
      </main>
    </StudioDesignProvider>,
  );

describe('ShellLifecycleDialogs', () => {
  afterEach(cleanup);

  it('presents sanitized logout failure recovery actions', async () => {
    const dismissPrompt = vi.fn();
    const confirmDiscard = vi.fn();
    renderDialogs(
      dialogProps({
        logout: {
          ...idleLogout,
          promptOpen: true,
          failure: 'Local cleanup did not finish.',
          dismissPrompt,
          confirmDiscard,
        },
      }),
    );

    expect(await screen.findByRole('heading', { name: 'Could not log out' })).toBeVisible();
    expect(screen.getByRole('alert')).toHaveTextContent('Local cleanup did not finish.');

    fireEvent.click(screen.getByRole('button', { name: 'Retry logout' }));
    fireEvent.click(screen.getByRole('button', { name: 'Stay in Studio' }));

    expect(confirmDiscard).toHaveBeenCalledOnce();
    expect(dismissPrompt).toHaveBeenCalledOnce();
  });

  it('returns from the active-work logout blocker without abandoning media', async () => {
    const dismissBlocked = vi.fn();
    renderDialogs(dialogProps({ logout: { ...idleLogout, blockedOpen: true, dismissBlocked } }));

    expect(
      await screen.findByRole('heading', { name: 'Finish active work before logging out' }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Return to Studio' }));

    expect(dismissBlocked).toHaveBeenCalledOnce();
  });

  it('names what an expiring session discards and offers exactly one way out', () => {
    const acknowledge = vi.fn();
    renderDialogs(
      dialogProps({
        sessionExpiry: { ...idleExpiry, noticeOpen: true, hasProjectProposal: true, acknowledge },
      }),
    );

    const notice = screen.getByRole('dialog', { name: 'Your session ended' });
    expect(notice).toHaveTextContent('The current temporary take');
    expect(notice).toHaveTextContent('Unsaved Project changes cannot be saved without a session');
    // There is no session left to stay in, so a cancel affordance would be a false promise.
    expect(screen.queryByRole('button', { name: /Stay/u })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Log in again' }));

    expect(acknowledge).toHaveBeenCalledOnce();
  });

  it('tells an active-work expiry that the running operation stops', () => {
    renderDialogs(
      dialogProps({ sessionExpiry: { ...idleExpiry, noticeOpen: true, hasActiveWork: true } }),
    );

    const notice = screen.getByRole('dialog', { name: 'Your session ended' });
    expect(notice).toHaveTextContent('will stop');
    expect(notice).not.toHaveTextContent('Unsaved Project changes');
  });
});
