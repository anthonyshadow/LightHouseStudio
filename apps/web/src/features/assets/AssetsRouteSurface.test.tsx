// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RemoteStateTestProvider } from '../../test/RemoteStateTestProvider';
import { mockApiServer } from '../../test/msw/server';
import { StudioDesignProvider } from '../../ui';
import { AssetsRouteSurface, type AssetCountState } from './AssetsRouteSurface';

const videosPage = (total: number) => ({
  videos: [],
  nextCursor: null,
  total,
  facets: { characterNames: [], formats: [] },
});

const ready = (count: number): AssetCountState => ({ status: 'ready', count });

const renderHub = (
  overrides: Partial<Parameters<typeof AssetsRouteSurface>[0]> = {},
): ReturnType<typeof render> =>
  render(
    <StudioDesignProvider>
      <RemoteStateTestProvider>
        <AssetsRouteSurface
          characters={ready(2)}
          outfits={ready(3)}
          creativeLibraryMirror="browser-only"
          onOpen={vi.fn()}
          onUploadVideo={vi.fn()}
          {...overrides}
        />
      </RemoteStateTestProvider>
    </StudioDesignProvider>,
  );

describe('AssetsRouteSurface', () => {
  afterEach(cleanup);

  it('promotes every reusable library and keeps upload as the primary action', async () => {
    mockApiServer.use(
      http.get('*/api/videos', () => HttpResponse.json(videosPage(7))),
      http.get('*/api/elevenlabs/voices/saved-count', () => HttpResponse.json({ count: 4 })),
    );
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const onUploadVideo = vi.fn();
    renderHub({ onOpen, onUploadVideo });

    expect(screen.getByRole('heading', { name: 'Assets', level: 1 })).toBeVisible();
    for (const name of ['Videos', 'Characters', 'Outfits', 'Voices']) {
      expect(screen.getByRole('heading', { name })).toBeVisible();
    }
    expect(screen.getByText('2 saved')).toBeVisible();
    expect(screen.getByText('3 saved')).toBeVisible();
    // Every card states a size, and the two server-held ones say it in their own terms.
    expect(await screen.findByText('7 saved')).toBeVisible();
    expect(await screen.findByText('4 kept')).toBeVisible();
    expect(screen.queryByText(/recipe/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Upload video' }));
    expect(onUploadVideo).toHaveBeenCalledOnce();
    await user.click(screen.getByRole('button', { name: 'Open Voices' }));
    expect(onOpen).toHaveBeenCalledWith('voices');
  });

  it('says it is counting rather than showing a zero it has not read', () => {
    // Never resolves: the loading state has to stand on its own.
    mockApiServer.use(
      http.get('*/api/videos', () => new Promise<never>(() => {})),
      http.get('*/api/elevenlabs/voices/saved-count', () => new Promise<never>(() => {})),
    );
    renderHub({ characters: { status: 'loading' }, outfits: { status: 'loading' } });

    expect(screen.getAllByText(/^Counting /u)).toHaveLength(4);
    expect(screen.queryByText(/^0 /u)).not.toBeInTheDocument();
  });

  it('offers a retry on the count that failed, and only that one', async () => {
    let videoReads = 0;
    mockApiServer.use(
      http.get('*/api/videos', () => {
        videoReads += 1;
        return videoReads === 1
          ? HttpResponse.json({ error: { code: 'internal', message: 'No.' } }, { status: 500 })
          : HttpResponse.json(videosPage(11));
      }),
      http.get('*/api/elevenlabs/voices/saved-count', () => HttpResponse.json({ count: 1 })),
    );
    const user = userEvent.setup();
    const reopenCreativeLibrary = vi.fn();
    renderHub({
      characters: { status: 'error', retry: reopenCreativeLibrary },
      outfits: ready(3),
    });

    const retryVideos = await screen.findByRole('button', { name: 'Retry counting Videos' });
    expect(await screen.findByText('1 kept')).toBeVisible();
    expect(screen.getByText('3 saved')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Retry counting Characters' }));
    expect(reopenCreativeLibrary).toHaveBeenCalledOnce();

    await user.click(retryVideos);
    await waitFor(() => expect(screen.getByText('11 saved')).toBeVisible());
  });

  it('states where the browser-held libraries live, and says it only of those two', () => {
    mockApiServer.use(
      http.get('*/api/videos', () => HttpResponse.json(videosPage(0))),
      http.get('*/api/elevenlabs/voices/saved-count', () => HttpResponse.json({ count: 0 })),
    );
    const { rerender } = renderHub({ characters: ready(0), outfits: ready(0) });

    // Characters and Outfits only: Videos and Voices are the server's and are not covered by it.
    expect(
      screen.getAllByText('Stored in this browser only — clearing site data deletes it.'),
    ).toHaveLength(2);

    rerender(
      <StudioDesignProvider>
        <RemoteStateTestProvider>
          <AssetsRouteSurface
            characters={ready(0)}
            outfits={ready(0)}
            creativeLibraryMirror="cloud"
            onOpen={vi.fn()}
            onUploadVideo={vi.fn()}
          />
        </RemoteStateTestProvider>
      </StudioDesignProvider>,
    );

    // A cloud copy is claimed only where the route that provides it is actually registered.
    expect(
      screen.queryByText('Stored in this browser only — clearing site data deletes it.'),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText('Stored in this browser and copied to your account.')).toHaveLength(
      2,
    );
  });
});
