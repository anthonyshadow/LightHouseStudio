// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudioDesignProvider } from '../../ui';
import { CreativeLibrarySyncNotice } from './CreativeLibrarySyncNotice';
import type { CreativeLibrarySyncStatus } from './useCreativeLibraryCloudSync';

const renderNotice = (status: CreativeLibrarySyncStatus) => {
  const actions = { retry: vi.fn(), keepLocal: vi.fn(), keepCloud: vi.fn() };
  render(
    <StudioDesignProvider>
      <CreativeLibrarySyncNotice status={status} {...actions} />
    </StudioDesignProvider>,
  );
  return actions;
};

const paused = (
  reason: 'diverged' | 'conflict' | 'unavailable',
  message = 'Sync paused.',
): CreativeLibrarySyncStatus => ({ state: 'paused', reason, message });

describe('CreativeLibrarySyncNotice', () => {
  afterEach(cleanup);

  it('stays out of the way while sync is healthy', () => {
    renderNotice({ state: 'idle' });

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('offers both resolutions for a divergence and confirms before overwriting', async () => {
    const actions = renderNotice(paused('diverged', 'Both sides changed.'));
    const user = userEvent.setup();

    expect(screen.getByText('Both sides changed.')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Save current copy' }));

    // Overwriting the other copy is destructive, so nothing happens until it is confirmed.
    expect(actions.keepLocal).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Save current copy' }));
    expect(actions.keepLocal).toHaveBeenCalledOnce();
  });

  it('lets the operator cancel a resolution without changing anything', async () => {
    const actions = renderNotice(paused('conflict'));
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Reload account copy' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Stay' }));

    expect(actions.keepCloud).not.toHaveBeenCalled();
    expect(actions.keepLocal).not.toHaveBeenCalled();
    expect(actions.retry).not.toHaveBeenCalled();
  });

  it('offers only a retry when the server could not be reached, because there is nothing to choose', async () => {
    const actions = renderNotice(paused('unavailable'));
    const user = userEvent.setup();

    expect(screen.queryByRole('button', { name: 'Save current copy' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reload account copy' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(actions.retry).toHaveBeenCalledOnce();
  });
});
