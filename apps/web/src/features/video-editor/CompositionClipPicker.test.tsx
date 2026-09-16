// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { Composition } from '@studio/domain';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudioDesignProvider } from '../../ui';
import { clipMediaEntryFixture, clipMediaFixture } from '../../test/compositionFixtures';
import type { ProjectClipMediaEntry } from '../projects/projectClipMedia';
import { CompositionClipPicker } from './CompositionClipPicker';

afterEach(cleanup);

const assetId = '79b94c02-d268-4201-a05b-1f3baa0caed1';
const otherAssetId = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f';
const projectId = '3f1c9e2a-6d4b-4f8a-9c21-5b7e0d8a4c11';

const held = (filename: string, overrides: Parameters<typeof clipMediaFixture>[3] = {}) =>
  clipMediaFixture(projectId, assetId, filename, overrides);

const opening = clipMediaEntryFixture({ kind: 'asset', assetId }, held('opening.mp4'));
const closing = clipMediaEntryFixture(
  { kind: 'asset', assetId: otherAssetId },
  held('closing.mp4', { width: 1_080, height: 1_920, durationMs: 4_500, hasAudio: false }),
);

/** Two clips over the first video, none over the second. */
const composition: Composition = {
  clips: [1, 2].map((index) => ({
    id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    media: { kind: 'asset', assetId },
    trim: { startMs: 0, endMs: 6_000 },
    audio: { level: 100, muted: false },
  })),
  subtitles: [],
};

type Catalogue = ReadonlyMap<string, ProjectClipMediaEntry>;
type Status = 'loading' | 'failed' | 'ready';

const renderPicker = (media: Catalogue, status: Status = 'ready') => {
  const onChoose = vi.fn();
  const onClose = vi.fn();
  const onRetry = vi.fn();
  const returnFocusRef = createRef<HTMLElement>();
  const picker = (held: Catalogue, state: Status, open: boolean) => (
    <StudioDesignProvider>
      <CompositionClipPicker
        open={open}
        media={held}
        status={state}
        onRetry={onRetry}
        composition={composition}
        returnFocusRef={returnFocusRef}
        onClose={onClose}
        onChoose={onChoose}
      />
    </StudioDesignProvider>
  );
  const view = render(picker(media, status, true));
  return {
    onChoose,
    onClose,
    onRetry,
    rerender: (next: Catalogue, state: Status = 'ready', open = true) =>
      view.rerender(picker(next, state, open)),
  };
};

const rows = () =>
  within(screen.getByRole('list', { name: 'Videos in this Project' })).getAllByRole('button');

describe('CompositionClipPicker', () => {
  it('lists every video the Project holds with what the render will read from it, and hands back the one chosen', () => {
    const { onChoose } = renderPicker(new Map([opening, closing]));
    const dialog = screen.getByRole('dialog', { name: 'Add a clip' });
    expect(dialog).toHaveAccessibleDescription(/becomes the last clip of the arrangement/u);
    // Named by their content — the file, its frame, its length, its sound — with the title
    // carrying the verb, so a screen reader hears what it is choosing between.
    expect(rows().map((row) => row.textContent)).toEqual([
      'opening.mp41920×1080 · 00:12.00 · with soundAlready in this arrangement as 2 clips.',
      'closing.mp41080×1920 · 00:04.50 · no sound',
    ]);
    expect(rows()[0]).not.toHaveAttribute('aria-label');

    fireEvent.click(screen.getByRole('button', { name: /^closing\.mp4/u }));
    expect(onChoose).toHaveBeenCalledWith(closing[1]);
  });

  it('says it is still reading while the catalogue is empty and loading, and follows it as it fills', () => {
    const { rerender } = renderPicker(new Map(), 'loading');
    expect(screen.getByRole('status')).toHaveTextContent('Loading videos…');
    expect(screen.queryByText('Nothing to add')).toBeNull();

    rerender(new Map([opening, closing]), 'loading');
    expect(screen.queryByRole('status')).toBeNull();
    expect(rows()).toHaveLength(2);
  });

  it('says the read failed, with a way to ask again, rather than that the Project holds nothing', () => {
    const { onRetry } = renderPicker(new Map(), 'failed');
    expect(screen.getByRole('alert')).toHaveTextContent(/could not be read from the local API/u);
    expect(screen.queryByText('Nothing to add')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('says plainly when there is nothing to add once the reads have settled', () => {
    renderPicker(new Map(), 'ready');
    expect(screen.getByText('Nothing to add')).toBeVisible();
    expect(screen.getByText('This Project holds no video to add.')).toBeVisible();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('stops taking choices the moment it is told to close, while it is still on screen', () => {
    const { onChoose, rerender } = renderPicker(new Map([opening, closing]));
    rerender(new Map([opening, closing]), 'ready', false);
    // Still present through the exit transition; the panel itself refuses the press.
    const row = screen.getByRole('button', { name: /^closing\.mp4/u });
    fireEvent.click(row);
    expect(onChoose).not.toHaveBeenCalled();
  });
});
