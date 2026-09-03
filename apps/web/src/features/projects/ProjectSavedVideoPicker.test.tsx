// @vitest-environment jsdom

import type { SavedVideoSummary } from '@studio/contracts';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RemoteStateTestProvider } from '../../test/RemoteStateTestProvider';
import { mockApiServer } from '../../test/msw/server';
import { StudioDesignProvider } from '../../ui';
import { ProjectSavedVideoPicker } from './ProjectSavedVideoPicker';

const now = '2026-01-01T00:00:00.000Z';

const summary = (overrides: Partial<SavedVideoSummary> = {}): SavedVideoSummary => ({
  id: '11111111-1111-4111-8111-111111111111',
  title: 'Library source',
  status: 'ready',
  currentVersion: {
    id: '22222222-2222-4222-8222-222222222222',
    videoId: '11111111-1111-4111-8111-111111111111',
    ordinal: 2,
    origin: 'editor',
    characterName: null,
    characterVariantName: null,
    sourceVersionId: null,
    mimeType: 'video/mp4',
    filename: 'library.mp4',
    sizeBytes: 2_048,
    durationMs: 90_000,
    width: 1_920,
    height: 1_080,
    exportSpecification: null,
    createdAt: now,
  },
  sourceVideoId: null,
  versionCount: 2,
  thumbnailAvailable: true,
  revision: 1,
  createdAt: now,
  updatedAt: now,
  ...overrides,
});

const secondSummary = summary({
  id: '33333333-3333-4333-8333-333333333333',
  title: 'Second take',
  thumbnailAvailable: false,
  currentVersion: {
    ...summary().currentVersion,
    id: '44444444-4444-4444-8444-444444444444',
    videoId: '33333333-3333-4333-8333-333333333333',
    durationMs: 5_000,
  },
});

const listVideos = (videos: readonly SavedVideoSummary[]) =>
  http.get('*/api/videos', () =>
    HttpResponse.json({
      videos,
      nextCursor: null,
      total: videos.length,
      facets: { characterNames: [], formats: ['landscape'] },
    }),
  );

const renderPicker = (props: Partial<Parameters<typeof ProjectSavedVideoPicker>[0]> = {}) => {
  const onSelect = vi.fn();
  const onClose = vi.fn();
  const view = render(
    <StudioDesignProvider>
      <RemoteStateTestProvider>
        <ProjectSavedVideoPicker
          open
          busy={false}
          returnFocusRef={createRef<HTMLElement>()}
          onClose={onClose}
          onSelect={onSelect}
          {...props}
        />
      </RemoteStateTestProvider>
    </StudioDesignProvider>,
  );
  return { onSelect, onClose, view };
};

describe('ProjectSavedVideoPicker', () => {
  afterEach(cleanup);

  beforeEach(() => {
    mockApiServer.use(listVideos([summary(), secondSummary]));
  });

  it('shows a thumbnail, duration and Version metadata for each Saved Video', async () => {
    renderPicker();

    const rows = await screen.findAllByRole('listitem');
    expect(rows).toHaveLength(2);

    expect(rows[0]!.querySelector('img')).toHaveAttribute(
      'src',
      '/api/videos/11111111-1111-4111-8111-111111111111/versions/22222222-2222-4222-8222-222222222222/thumbnail',
    );
    expect(rows[0]!).toHaveTextContent('Version 2 · 1920×1080 · 1:30');
    expect(within(rows[0]!).getAllByText('1:30').length).toBeGreaterThan(0);

    // A Saved Video without a stored thumbnail falls back rather than rendering a broken image.
    expect(rows[1]!.querySelector('img')).toBeNull();
    expect(rows[1]!).toHaveTextContent('Video preview');
  });

  it('falls back when a stored thumbnail fails to load', async () => {
    renderPicker();

    const rows = await screen.findAllByRole('listitem');
    fireEvent.error(rows[0]!.querySelector('img')!);

    await waitFor(() => expect(rows[0]!.querySelector('img')).toBeNull());
    expect(rows[0]!).toHaveTextContent('Video preview');
  });

  it('previews the exact current Version without selecting it', async () => {
    const user = userEvent.setup();
    const { onSelect } = renderPicker();

    const rows = await screen.findAllByRole('listitem');
    const toggle = within(rows[0]!).getByRole('button', { name: 'Preview' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await user.click(toggle);

    const player = await screen.findByLabelText<HTMLVideoElement>('Preview of Library source');
    expect(player).toHaveAttribute(
      'src',
      '/api/videos/11111111-1111-4111-8111-111111111111/versions/22222222-2222-4222-8222-222222222222/content',
    );
    expect(player).toHaveAttribute(
      'poster',
      '/api/videos/11111111-1111-4111-8111-111111111111/versions/22222222-2222-4222-8222-222222222222/thumbnail',
    );
    expect(within(rows[0]!).getByRole('button', { name: 'Hide preview' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('keeps only one preview open at a time', async () => {
    const user = userEvent.setup();
    renderPicker();

    const rows = await screen.findAllByRole('listitem');
    await user.click(within(rows[0]!).getByRole('button', { name: 'Preview' }));
    expect(await screen.findByLabelText('Preview of Library source')).toBeVisible();

    await user.click(within(rows[1]!).getByRole('button', { name: 'Preview' }));

    await waitFor(() => expect(screen.queryByLabelText('Preview of Library source')).toBeNull());
    expect(screen.getByLabelText('Preview of Second take')).toBeVisible();
  });

  it('still selects the exact summary on a single click', async () => {
    const user = userEvent.setup();
    const { onSelect } = renderPicker();

    const rows = await screen.findAllByRole('listitem');
    await user.click(within(rows[0]!).getByRole('button', { name: /Library source/u }));

    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect.mock.calls[0]![0]).toMatchObject({
      id: '11111111-1111-4111-8111-111111111111',
      currentVersion: { id: '22222222-2222-4222-8222-222222222222' },
    });
  });

  it('disables selection and preview while busy or while a Version is not ready', async () => {
    mockApiServer.use(listVideos([summary({ status: 'missing' })]));
    renderPicker();

    let row = (await screen.findAllByRole('listitem'))[0]!;
    expect(within(row).getByRole('button', { name: /Library source/u })).toBeDisabled();
    expect(within(row).getByRole('button', { name: 'Preview' })).toBeDisabled();

    mockApiServer.use(listVideos([summary()]));
    renderPicker({ busy: true });

    row = (await screen.findAllByRole('listitem'))[0]!;
    expect(within(row).getByRole('button', { name: /Library source/u })).toBeDisabled();
    expect(within(row).getByRole('button', { name: 'Preview' })).toBeDisabled();
  });
});
