// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudioDesignProvider } from '../../ui';
import { AssetsRouteSurface } from './AssetsRouteSurface';

describe('AssetsRouteSurface', () => {
  afterEach(cleanup);

  it('promotes every reusable library and keeps upload as the primary action', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const onUploadVideo = vi.fn();
    render(
      <StudioDesignProvider>
        <AssetsRouteSurface
          characterCount={2}
          outfitCount={3}
          creativeLibraryMirror="browser-only"
          onOpen={onOpen}
          onUploadVideo={onUploadVideo}
        />
      </StudioDesignProvider>,
    );

    expect(screen.getByRole('heading', { name: 'Assets', level: 1 })).toBeVisible();
    for (const name of ['Videos', 'Characters', 'Outfits', 'Voices']) {
      expect(screen.getByRole('heading', { name })).toBeVisible();
    }
    expect(screen.getByText('2 saved')).toBeVisible();
    expect(screen.getByText('3 saved')).toBeVisible();
    expect(screen.queryByText(/recipe/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Upload video' }));
    expect(onUploadVideo).toHaveBeenCalledOnce();
    await user.click(screen.getByRole('button', { name: 'Open Voices' }));
    expect(onOpen).toHaveBeenCalledWith('voices');
  });

  it('states where the browser-held libraries live, and says it only of those two', () => {
    const { rerender } = render(
      <StudioDesignProvider>
        <AssetsRouteSurface
          characterCount={0}
          outfitCount={0}
          creativeLibraryMirror="browser-only"
          onOpen={vi.fn()}
          onUploadVideo={vi.fn()}
        />
      </StudioDesignProvider>,
    );

    // Characters and Outfits only: Videos and Voices are the server's and are not covered by it.
    expect(
      screen.getAllByText('Stored in this browser only — clearing site data deletes it.'),
    ).toHaveLength(2);

    rerender(
      <StudioDesignProvider>
        <AssetsRouteSurface
          characterCount={0}
          outfitCount={0}
          creativeLibraryMirror="cloud"
          onOpen={vi.fn()}
          onUploadVideo={vi.fn()}
        />
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
