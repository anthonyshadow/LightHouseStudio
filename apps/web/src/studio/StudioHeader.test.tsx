// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudioDesignProvider } from '../ui';
import { StudioHeader } from './StudioHeader';

const availability = {
  decart: true,
  elevenLabs: false,
  elevenLabsModel: null,
};

const browser = {
  secureContext: true,
  mediaDevices: true,
  mediaRecorder: true,
  webAudio: true,
  offlineAudio: true,
};

const headerProps = {
  user: {
    id: '2d7914b2-f912-4b96-b17d-54100a2ffea3',
    login: 'demo@lightframe.local',
    username: 'demo',
    email: 'demo@lightframe.local',
    displayName: 'Demo Creator',
    avatarUrl: null,
    planId: 'free' as const,
    role: 'user' as const,
    status: 'active' as const,
    createdAt: '2026-08-05T12:00:00.000Z',
    updatedAt: '2026-08-05T12:00:00.000Z',
    lastLoginAt: '2026-08-05T12:00:00.000Z',
  },
  activeDestination: 'studio' as const,
  onOpenStudio: vi.fn(),
  onOpenProjects: vi.fn(),
  onOpenVideos: vi.fn(),
  onOpenCharacters: vi.fn(),
  onOpenOutfits: vi.fn(),
  onLogout: vi.fn(),
};

const renderHeader = () =>
  render(
    <StudioDesignProvider>
      <StudioHeader
        {...headerProps}
        availability={availability}
        browser={browser}
        capabilityState="ready"
      />
      <button type="button">Outside header</button>
    </StudioDesignProvider>,
  );

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('StudioHeader', () => {
  it('exposes Studio and Projects as the one primary navigation', async () => {
    const user = userEvent.setup();
    renderHeader();
    const navigation = screen.getByRole('navigation', { name: 'Primary' });

    expect(within(navigation).getByRole('button', { name: 'Studio' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await user.click(within(navigation).getByRole('button', { name: 'Projects' }));
    expect(headerProps.onOpenProjects).toHaveBeenCalledOnce();
  });

  it('keeps status before the far-right account control and omits Select AI', () => {
    renderHeader();
    const header = screen.getByRole('banner');
    const status = within(header).getByRole('button', { name: 'Studio available to try' });
    const account = within(header).getByRole('button', { name: 'Demo Creator account menu' });

    expect(status.compareDocumentPosition(account) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(header).queryByRole('button', { name: /Select AI/u })).not.toBeInTheDocument();
  });

  it('renders only one header menu at a time', async () => {
    const user = userEvent.setup();
    renderHeader();
    const account = screen.getByRole('button', { name: 'Demo Creator account menu' });
    const status = screen.getByRole('button', { name: 'Studio available to try' });

    await user.click(account);
    expect(screen.getByRole('menu', { name: 'Account and saved libraries' })).toBeVisible();

    await user.click(status);
    expect(
      screen.queryByRole('menu', { name: 'Account and saved libraries' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Studio availability details' })).toBeVisible();

    await user.click(account);
    expect(
      screen.queryByRole('region', { name: 'Studio availability details' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('menu', { name: 'Account and saved libraries' })).toBeVisible();
  });

  it('closes status for Escape and outside pointer and restores trigger focus', async () => {
    const user = userEvent.setup();
    renderHeader();
    const status = screen.getByRole('button', { name: 'Studio available to try' });

    await user.click(status);
    await user.keyboard('{Escape}');
    expect(
      screen.queryByRole('region', { name: 'Studio availability details' }),
    ).not.toBeInTheDocument();
    expect(status).toHaveFocus();

    await user.click(status);
    await user.click(screen.getByRole('button', { name: 'Outside header' }));
    expect(
      screen.queryByRole('region', { name: 'Studio availability details' }),
    ).not.toBeInTheDocument();
  });
});
