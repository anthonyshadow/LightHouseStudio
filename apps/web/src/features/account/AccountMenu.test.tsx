// @vitest-environment jsdom

import type { AuthenticatedUser } from '@studio/contracts';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudioDesignProvider } from '../../ui';
import { AccountMenu } from './AccountMenu';

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

type HarnessProps = Omit<ComponentProps<typeof AccountMenu>, 'open' | 'onOpenChange'>;

const AccountMenuHarness = (props: HarnessProps) => {
  const [open, setOpen] = useState(false);
  return <AccountMenu {...props} open={open} onOpenChange={setOpen} />;
};

describe('AccountMenu', () => {
  afterEach(cleanup);

  it('supports menu keyboard movement, escape focus return, and every action', async () => {
    const userInput = userEvent.setup();
    const actions = {
      onOpenVideos: vi.fn(),
      onOpenCharacters: vi.fn(),
      onOpenOutfits: vi.fn(),
      onLogout: vi.fn(),
    };
    render(
      <StudioDesignProvider>
        <AccountMenuHarness user={user} {...actions} />
      </StudioDesignProvider>,
    );
    const trigger = screen.getByRole('button', { name: 'Lightframe Demo account menu' });
    expect(screen.getByText('Libraries')).toBeVisible();

    await userInput.click(trigger);
    await waitFor(() =>
      expect(screen.getByRole('menuitem', { name: 'Saved Videos' })).toHaveFocus(),
    );
    await userInput.keyboard('{End}');
    expect(screen.getByRole('menuitem', { name: 'Log out' })).toHaveFocus();
    await userInput.keyboard('{Home}');
    await userInput.keyboard('{ArrowUp}');
    expect(screen.getByRole('menuitem', { name: 'Log out' })).toHaveFocus();
    await userInput.keyboard('{Escape}');
    expect(trigger).toHaveFocus();

    for (const [label, callback] of [
      ['Saved Videos', actions.onOpenVideos],
      ['Saved Characters', actions.onOpenCharacters],
      ['Saved Outfits', actions.onOpenOutfits],
      ['Log out', actions.onLogout],
    ] as const) {
      await userInput.click(trigger);
      await userInput.click(screen.getByRole('menuitem', { name: label }));
      expect(callback).toHaveBeenCalledOnce();
    }
  });

  it('opens from ArrowDown and closes on an outside pointer', async () => {
    const userInput = userEvent.setup();
    render(
      <StudioDesignProvider>
        <AccountMenuHarness
          user={user}
          onOpenVideos={vi.fn()}
          onOpenCharacters={vi.fn()}
          onOpenOutfits={vi.fn()}
          onLogout={vi.fn()}
        />
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

  it('labels global-library navigation as an explicit Project-context exit', async () => {
    const userInput = userEvent.setup();
    render(
      <StudioDesignProvider>
        <AccountMenuHarness
          user={user}
          projectContextActive
          onOpenVideos={vi.fn()}
          onOpenCharacters={vi.fn()}
          onOpenOutfits={vi.fn()}
          onLogout={vi.fn()}
        />
      </StudioDesignProvider>,
    );

    await userInput.click(screen.getByRole('button', { name: 'Lightframe Demo account menu' }));
    expect(screen.getByText('Global libraries · exits Project')).toBeVisible();
    expect(screen.getByRole('menuitem', { name: 'Saved Videos (exits Project)' })).toBeVisible();
  });

  it('marks the exact current saved library without changing the compact account control name', async () => {
    const userInput = userEvent.setup();
    render(
      <StudioDesignProvider>
        <AccountMenuHarness
          user={user}
          activeLibrary="characters"
          onOpenVideos={vi.fn()}
          onOpenCharacters={vi.fn()}
          onOpenOutfits={vi.fn()}
          onLogout={vi.fn()}
        />
      </StudioDesignProvider>,
    );

    const trigger = screen.getByRole('button', { name: 'Lightframe Demo account menu' });
    expect(trigger).toHaveAttribute('data-library-active', 'true');
    await userInput.click(trigger);
    expect(screen.getByRole('menuitem', { name: 'Saved Characters' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('menuitem', { name: 'Saved Videos' })).not.toHaveAttribute(
      'aria-current',
    );
  });
});
