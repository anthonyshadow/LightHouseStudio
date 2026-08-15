// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudioDesignProvider } from '../ui';
import { StudioHeader } from './StudioHeader';

const availability = {
  decart: true,
  realtimeBetaEnabled: true,
  realtimeProviderConfigured: true,
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
  onOpenDashboard: vi.fn(),
  onOpenStudio: vi.fn(),
  onOpenProjects: vi.fn(),
  onOpenCampaigns: vi.fn(),
  onOpenAssets: vi.fn(),
  onCreateProject: vi.fn(),
  onCreateCampaign: vi.fn(),
  onCreateAsset: vi.fn(),
  onOpenLive: vi.fn(),
  onLogout: vi.fn(),
};

const renderHeader = (overrides: Partial<ComponentProps<typeof StudioHeader>> = {}) =>
  render(
    <StudioDesignProvider>
      <StudioHeader
        {...headerProps}
        availability={availability}
        browser={browser}
        capabilityState="ready"
        {...overrides}
      />
      <button type="button">Outside header</button>
    </StudioDesignProvider>,
  );

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('StudioHeader', () => {
  it('exposes Dashboard, Projects, Campaigns, and Assets as primary navigation', async () => {
    const user = userEvent.setup();
    renderHeader();
    const navigation = screen.getByRole('navigation', { name: 'Primary' });

    expect(within(navigation).queryByRole('button', { name: 'Studio' })).not.toBeInTheDocument();
    await user.click(within(navigation).getByRole('button', { name: 'Dashboard' }));
    expect(headerProps.onOpenDashboard).toHaveBeenCalledOnce();
    await user.click(within(navigation).getByRole('button', { name: 'Projects' }));
    expect(headerProps.onOpenProjects).toHaveBeenCalledOnce();
    await user.click(within(navigation).getByRole('button', { name: 'Campaigns' }));
    expect(headerProps.onOpenCampaigns).toHaveBeenCalledOnce();
    await user.click(within(navigation).getByRole('button', { name: 'Assets' }));
    expect(headerProps.onOpenAssets).toHaveBeenCalledOnce();
  });

  it('marks Assets as the current destination independently from Account', async () => {
    const user = userEvent.setup();
    renderHeader({ activeDestination: 'assets' });
    const navigation = screen.getByRole('navigation', { name: 'Primary' });

    expect(within(navigation).getByRole('button', { name: 'Assets' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    await user.click(screen.getByRole('button', { name: 'Demo Creator account menu' }));
    expect(screen.getByRole('menu', { name: 'Account' })).toBeVisible();
    expect(screen.queryByRole('menuitem', { name: /Saved/u })).not.toBeInTheDocument();
  });

  it('keeps status before the far-right account control and omits Select AI', () => {
    renderHeader();
    const header = screen.getByRole('banner');
    const status = within(header).getByRole('button', { name: 'Core Studio ready' });
    const account = within(header).getByRole('button', { name: 'Demo Creator account menu' });

    expect(status.compareDocumentPosition(account) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(header).queryByRole('button', { name: /Select AI/u })).not.toBeInTheDocument();
  });

  it('renders only one header menu at a time', async () => {
    const user = userEvent.setup();
    renderHeader();
    const account = screen.getByRole('button', { name: 'Demo Creator account menu' });
    const status = screen.getByRole('button', { name: 'Core Studio ready' });

    await user.click(account);
    expect(screen.getByRole('menu', { name: 'Account' })).toBeVisible();

    await user.click(status);
    expect(screen.queryByRole('menu', { name: 'Account' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Studio availability details' })).toBeVisible();

    await user.click(account);
    expect(
      screen.queryByRole('region', { name: 'Studio availability details' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('menu', { name: 'Account' })).toBeVisible();
  });

  it('closes status for Escape and outside pointer and restores trigger focus', async () => {
    const user = userEvent.setup();
    renderHeader();
    const status = screen.getByRole('button', { name: 'Core Studio ready' });

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

  it.each([
    {
      state: 'loading' as const,
      label: 'Checking integrations',
      ai: 'checking',
      voice: 'checking',
    },
    {
      state: 'error' as const,
      label: 'Integration status unavailable',
      ai: 'configuration unavailable',
      voice: 'configuration unavailable',
    },
  ])(
    'explains the $state capability state without implying live health',
    async ({ state, label, ai, voice }) => {
      const user = userEvent.setup();
      renderHeader({ capabilityState: state });

      await user.click(screen.getByRole('button', { name: label }));
      const details = screen.getByRole('region', { name: 'Studio availability details' });
      expect(details).toHaveTextContent(`Existing-video AI ${ai}`);
      expect(details).toHaveTextContent(`Voice cloud ${voice}`);
      expect(details).toHaveTextContent('Configuration does not verify live provider health.');
    },
  );

  it('reports limited local capture and provider configuration independently', async () => {
    const user = userEvent.setup();
    renderHeader({
      availability: {
        decart: false,
        realtimeBetaEnabled: false,
        realtimeProviderConfigured: false,
        elevenLabs: false,
        elevenLabsModel: null,
      },
      browser: { ...browser, secureContext: false },
    });

    await user.click(screen.getByRole('button', { name: 'Studio limited' }));
    const details = screen.getByRole('region', { name: 'Studio availability details' });
    expect(details).toHaveTextContent('Local capture unavailable');
    expect(details).toHaveTextContent('Existing-video AI not configured');
    expect(details).toHaveTextContent('Voice cloud not configured (optional)');
  });

  it('offers all creation paths and hides Live AI when its beta gate is off', async () => {
    const user = userEvent.setup();
    renderHeader({
      availability: {
        decart: true,
        realtimeBetaEnabled: false,
        realtimeProviderConfigured: true,
        elevenLabs: false,
        elevenLabsModel: null,
      },
    });

    await user.click(screen.getByRole('button', { name: 'Quick Create' }));
    const menu = screen.getByRole('menu', { name: 'Quick Create' });
    expect(within(menu).queryByRole('menuitem', { name: /Live AI/u })).not.toBeInTheDocument();
    expect(within(menu).queryByRole('menuitem', { name: /Recipe/u })).not.toBeInTheDocument();
    await user.click(within(menu).getByRole('menuitem', { name: 'New video' }));

    expect(headerProps.onOpenStudio).toHaveBeenCalledOnce();
  });

  it('opens the shared Create Asset launcher from Quick Create', async () => {
    const user = userEvent.setup();
    renderHeader();

    const trigger = screen.getByRole('button', { name: 'Quick Create' });
    await user.click(trigger);
    await user.click(
      within(screen.getByRole('menu', { name: 'Quick Create' })).getByRole('menuitem', {
        name: 'Create Asset',
      }),
    );

    expect(headerProps.onCreateAsset).toHaveBeenCalledWith(trigger);
  });
});
