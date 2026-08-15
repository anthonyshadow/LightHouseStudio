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
    await waitFor(() => expect(screen.getByRole('menuitem', { name: 'Log out' })).toHaveFocus());
    expect(screen.getByText('demo@lightframe.local')).toBeVisible();
    expect(screen.getByRole('menuitem', { name: 'Log out' })).toHaveFocus();
    await userInput.keyboard('{Escape}');
    expect(trigger).toHaveFocus();

    await userInput.click(trigger);
    await userInput.click(screen.getByRole('menuitem', { name: 'Log out' }));
    expect(onLogout).toHaveBeenCalledOnce();
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
