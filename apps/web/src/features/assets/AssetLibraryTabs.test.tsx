// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RemoteStateTestProvider } from '../../test/RemoteStateTestProvider';
import { mockApiServer } from '../../test/msw/server';
import { StudioDesignProvider } from '../../ui';
import { AssetLibraryTabs, type AssetCountState } from './AssetLibraryTabs';

const ready = (count: number): AssetCountState => ({ status: 'ready', count });

const renderTabs = (
  overrides: Partial<Parameters<typeof AssetLibraryTabs>[0]> = {},
): ReturnType<typeof render> =>
  render(
    <StudioDesignProvider>
      <RemoteStateTestProvider>
        <AssetLibraryTabs
          active="videos"
          characters={ready(2)}
          outfits={ready(3)}
          onSelect={vi.fn()}
          {...overrides}
        />
      </RemoteStateTestProvider>
    </StudioDesignProvider>,
  );

describe('AssetLibraryTabs', () => {
  afterEach(cleanup);

  it('keeps all libraries in one switcher with accurate account and server counts', async () => {
    mockApiServer.use(
      http.get('*/api/videos', () =>
        HttpResponse.json({
          videos: [],
          nextCursor: null,
          total: 7,
          facets: { characterNames: [], formats: [] },
        }),
      ),
      http.get('*/api/elevenlabs/voices/saved-count', () => HttpResponse.json({ count: 4 })),
    );
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderTabs({ onSelect });

    const navigation = screen.getByRole('navigation', { name: 'Asset libraries' });
    expect(within(navigation).getByRole('button', { name: /Videos/u })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(navigation).getByRole('button', { name: /Characters.*2 saved/u })).toBeVisible();
    expect(within(navigation).getByRole('button', { name: /Outfits.*3 saved/u })).toBeVisible();
    await waitFor(() =>
      expect(within(navigation).getByRole('button', { name: /Videos.*7 saved/u })).toBeVisible(),
    );
    expect(
      await within(navigation).findByRole('button', { name: /Voices.*4 kept/u }),
    ).toBeVisible();

    await user.click(within(navigation).getByRole('button', { name: /Characters/u }));
    expect(onSelect).toHaveBeenCalledWith('characters');
  });

  it('reserves count space while loading and retries an active failed count', async () => {
    mockApiServer.use(
      http.get('*/api/videos', () => new Promise<never>(() => {})),
      http.get('*/api/elevenlabs/voices/saved-count', () => new Promise<never>(() => {})),
    );
    const user = userEvent.setup();
    const retry = vi.fn();
    renderTabs({ active: 'characters', characters: { status: 'error', retry } });

    const navigation = screen.getByRole('navigation', { name: 'Asset libraries' });
    expect(navigation.querySelectorAll('[data-asset-tab-count="loading"]')).toHaveLength(2);
    expect(
      within(navigation).getByRole('button', { name: /Characters.*count unavailable/u }),
    ).toBeVisible();
    expect(screen.queryByText(/^0 saved$/u)).not.toBeInTheDocument();

    await user.click(within(navigation).getByRole('button', { name: /Characters/u }));
    expect(retry).toHaveBeenCalledOnce();
  });
});
