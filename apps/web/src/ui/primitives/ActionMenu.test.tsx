// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudioDesignProvider } from '../StudioDesignProvider';
import { ActionMenu, type ActionMenuItem } from './ActionMenu';

afterEach(() => {
  cleanup();
});

const renderMenu = (items: readonly ActionMenuItem[]) =>
  render(
    <StudioDesignProvider>
      <ActionMenu label="More actions for Morning take" items={items} />
      <button type="button">Outside</button>
    </StudioDesignProvider>,
  );

const open = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: 'More actions for Morning take' }));
  return screen.getByRole('menu', { name: 'More actions for Morning take' });
};

describe('ActionMenu', () => {
  it('exposes menu semantics and runs an item with the trigger it must return focus to', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderMenu([{ id: 'rename', label: 'Rename', onSelect }]);

    const trigger = screen.getByRole('button', { name: 'More actions for Morning take' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await open(user);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await user.click(screen.getByRole('menuitem', { name: 'Rename' }));

    expect(onSelect).toHaveBeenCalledWith(trigger);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('closes on Escape and restores focus to the trigger', async () => {
    const user = userEvent.setup();
    renderMenu([{ id: 'rename', label: 'Rename', onSelect: vi.fn() }]);

    await open(user);
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'More actions for Morning take' })).toHaveFocus();
  });

  it('closes when a pointer lands outside it', async () => {
    const user = userEvent.setup();
    renderMenu([{ id: 'rename', label: 'Rename', onSelect: vi.fn() }]);

    await open(user);
    await user.click(screen.getByRole('button', { name: 'Outside' }));

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('walks its items with the arrow keys, wrapping at both ends', async () => {
    const user = userEvent.setup();
    renderMenu([
      { id: 'rename', label: 'Rename', onSelect: vi.fn() },
      { id: 'archive', label: 'Archive', danger: true, onSelect: vi.fn() },
    ]);

    await open(user);
    await vi.waitFor(() => expect(screen.getByRole('menuitem', { name: 'Rename' })).toHaveFocus());

    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Archive' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Rename' })).toHaveFocus();
    await user.keyboard('{End}');
    expect(screen.getByRole('menuitem', { name: 'Archive' })).toHaveFocus();
  });

  it('keeps a disabled item focusable, states its reason, and refuses to run it', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderMenu([
      {
        id: 'edit',
        label: 'Edit video',
        disabled: true,
        disabledReason: 'Still processing.',
        onSelect,
      },
    ]);

    const menu = await open(user);
    const item = screen.getByRole('menuitem', { name: 'Edit video' });
    expect(item).toHaveAttribute('aria-disabled', 'true');
    expect(item).toHaveAccessibleDescription('Still processing.');

    await user.click(item);
    expect(onSelect).not.toHaveBeenCalled();
    expect(menu).toBeInTheDocument();
  });

  it('renders nothing when it would hold no items', () => {
    renderMenu([]);
    expect(screen.queryByRole('button', { name: 'More actions for Morning take' })).toBeNull();
  });
});
