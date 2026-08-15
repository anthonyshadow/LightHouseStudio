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
          recipeCount={4}
          onOpen={onOpen}
          onUploadVideo={onUploadVideo}
        />
      </StudioDesignProvider>,
    );

    expect(screen.getByRole('heading', { name: 'Assets', level: 1 })).toBeVisible();
    for (const name of ['Videos', 'Characters', 'Outfits', 'Voices', 'Recipes']) {
      expect(screen.getByRole('heading', { name })).toBeVisible();
    }
    expect(screen.getByText('2 saved')).toBeVisible();
    expect(screen.getByText('3 saved')).toBeVisible();
    expect(screen.getByText('4 saved')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Upload video' }));
    expect(onUploadVideo).toHaveBeenCalledOnce();
    await user.click(screen.getByRole('button', { name: 'Open Voices' }));
    expect(onOpen).toHaveBeenCalledWith('voices');
  });
});
