// @vitest-environment jsdom

import type { AuthenticatedSessionResponse, AuthenticatedUser } from '@studio/contracts';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { useState, type ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RemoteStateTestProvider } from '../../test/RemoteStateTestProvider';
import { mockApiServer } from '../../test/msw/server';
import { StudioDesignProvider } from '../../ui';
import { AccountMenu, type AccountDetailsSource } from './AccountMenu';

const user: AuthenticatedUser = {
  id: '2d7914b2-f912-4b96-b17d-54100a2ffea3',
  login: 'demo@lightframe.local',
  username: 'demo',
  email: 'demo@lightframe.local',
  displayName: 'Lightframe Demo',
  avatarUrl: null,
  planId: 'free',
  role: 'user',
  status: 'active',
  createdAt: '2026-08-05T12:00:00.000Z',
  updatedAt: '2026-08-05T12:00:00.000Z',
  lastLoginAt: '2026-08-05T12:00:00.000Z',
};

const session: AuthenticatedSessionResponse = {
  user,
  entitlements: {
    planId: 'free',
    capabilities: {
      'local-camera': true,
      'upload-video': true,
      'character-swap': true,
      'virtual-try-on': true,
      'voice-effects': true,
      'video-editor': true,
      'saved-characters': true,
      'saved-outfits': true,
      'saved-videos': true,
    },
    limits: {
      maximumSavedVideos: null,
      maximumSavedCharacters: null,
      maximumSavedOutfits: null,
      monthlyCredits: null,
    },
    evaluatedAt: '2026-08-05T12:00:00.000Z',
  },
  expiresAt: '2026-08-05T20:00:00.000Z',
};

const details: AccountDetailsSource = {
  session,
  capabilityRows: [
    { id: 'local-capture', label: 'Local capture', state: 'available' },
    { id: 'existing-video-ai', label: 'Existing-video AI', state: 'configured' },
    { id: 'live-ai', label: 'Live AI Beta', state: 'enabled' },
    { id: 'voice-cloud', label: 'Voice cloud', state: 'not configured (optional)' },
  ],
  capabilityFootnote: 'Configuration does not verify live provider health.',
};

type HarnessProps = Omit<ComponentProps<typeof AccountMenu>, 'open' | 'onOpenChange'>;

const AccountMenuHarness = (props: HarnessProps) => {
  const [open, setOpen] = useState(false);
  return <AccountMenu {...props} open={open} onOpenChange={setOpen} />;
};

describe('AccountMenu', () => {
  afterEach(cleanup);

  it('shows account identity, supports keyboard focus return, and logs out', async () => {
    const userInput = userEvent.setup();
    const onLogout = vi.fn();
    render(
      <StudioDesignProvider>
        <AccountMenuHarness user={user} onLogout={onLogout} />
      </StudioDesignProvider>,
    );
    const trigger = screen.getByRole('button', { name: 'Lightframe Demo account menu' });

    await userInput.click(trigger);
    // Settings leads the menu, so it is what the roving focus lands on.
    await waitFor(() => expect(screen.getByRole('menuitem', { name: 'Settings' })).toHaveFocus());
    expect(screen.getByText('demo@lightframe.local')).toBeVisible();
    await userInput.keyboard('{Escape}');
    expect(trigger).toHaveFocus();

    await userInput.click(trigger);
    await userInput.click(screen.getByRole('menuitem', { name: 'Log out' }));
    expect(onLogout).toHaveBeenCalledOnce();
  });

  it('shows the read-only account details panel and returns focus to the trigger', async () => {
    const jobId = '5f0c2f8a-97d8-4c93-b7f0-7f1b3f4a2c11';
    mockApiServer.use(
      http.get('*/api/video-jobs', () =>
        HttpResponse.json({
          jobs: [
            {
              jobId,
              operation: 'character-swap',
              provider: 'wiro',
              status: 'processing',
              createdAt: '2026-08-05T12:00:00.000Z',
              updatedAt: '2026-08-05T12:01:00.000Z',
              expiresAt: '2026-08-05T13:00:00.000Z',
              providerCancellationSupported: false,
            },
          ],
        }),
      ),
    );
    const userInput = userEvent.setup();
    render(
      <StudioDesignProvider>
        <RemoteStateTestProvider>
          <AccountMenuHarness user={user} details={details} onLogout={vi.fn()} />
        </RemoteStateTestProvider>
      </StudioDesignProvider>,
    );
    const trigger = screen.getByRole('button', { name: 'Lightframe Demo account menu' });

    await userInput.click(trigger);
    await userInput.click(screen.getByRole('menuitem', { name: 'Account details' }));

    const panel = await screen.findByRole('dialog', { name: 'Account' });
    // The sign-in and email rows both carry the demo address.
    expect(within(panel).getAllByText('demo@lightframe.local')).toHaveLength(2);
    expect(within(panel).getByText('Free plan')).toBeVisible();
    expect(within(panel).getByText('Character Swap')).toBeVisible();
    expect(within(panel).getByText('Existing-video AI')).toBeVisible();
    expect(within(panel).getByText('not configured (optional)')).toBeVisible();
    expect(
      within(panel).getByText('Configuration does not verify live provider health.'),
    ).toBeVisible();
    expect(await within(panel).findByText('1 AI job is running right now.')).toBeVisible();
    expect(
      within(panel).getByText(/does not keep a lifetime total across Projects/u),
    ).toBeVisible();

    await userInput.click(within(panel).getByRole('button', { name: 'Close panel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('states honestly when the running job count is unavailable', async () => {
    mockApiServer.use(http.get('*/api/video-jobs', () => HttpResponse.error()));
    const userInput = userEvent.setup();
    render(
      <StudioDesignProvider>
        <RemoteStateTestProvider>
          <AccountMenuHarness user={user} details={details} onLogout={vi.fn()} />
        </RemoteStateTestProvider>
      </StudioDesignProvider>,
    );

    await userInput.click(screen.getByRole('button', { name: 'Lightframe Demo account menu' }));
    await userInput.click(screen.getByRole('menuitem', { name: 'Account details' }));

    const panel = await screen.findByRole('dialog', { name: 'Account' });
    expect(
      await within(panel).findByText('The number of running AI jobs is unavailable right now.'),
    ).toBeVisible();
  });

  it('keeps Settings and Log out when no details source is provided', async () => {
    const userInput = userEvent.setup();
    render(
      <StudioDesignProvider>
        <AccountMenuHarness user={user} onLogout={vi.fn()} />
      </StudioDesignProvider>,
    );

    await userInput.click(screen.getByRole('button', { name: 'Lightframe Demo account menu' }));
    // Settings is about this browser, not this account, so it does not depend on a details source.
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Settings',
      'Log out',
    ]);
    expect(screen.queryByRole('menuitem', { name: 'Account details' })).not.toBeInTheDocument();
  });

  it('opens the settings panel from the profile menu and returns focus to the trigger', async () => {
    const userInput = userEvent.setup();
    render(
      <StudioDesignProvider>
        <AccountMenuHarness user={user} onLogout={vi.fn()} />
      </StudioDesignProvider>,
    );
    const trigger = screen.getByRole('button', { name: 'Lightframe Demo account menu' });

    await userInput.click(trigger);
    await userInput.click(screen.getByRole('menuitem', { name: 'Settings' }));

    const panel = await screen.findByRole('dialog', { name: 'Settings' });
    expect(within(panel).getByRole('heading', { name: 'Getting started' })).toBeVisible();
    expect(within(panel).getByRole('heading', { name: 'Capture defaults' })).toBeVisible();
    expect(within(panel).getByRole('heading', { name: 'What this browser keeps' })).toBeVisible();

    await userInput.keyboard('{Escape}');
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('opens from ArrowDown and closes on an outside pointer', async () => {
    const userInput = userEvent.setup();
    render(
      <StudioDesignProvider>
        <AccountMenuHarness user={user} onLogout={vi.fn()} />
        <button type="button">Outside</button>
      </StudioDesignProvider>,
    );
    const trigger = screen.getByRole('button', { name: 'Lightframe Demo account menu' });
    trigger.focus();
    await userInput.keyboard('{ArrowDown}');
    expect(await screen.findByRole('menu')).toBeVisible();
    await userInput.click(screen.getByRole('button', { name: 'Outside' }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
