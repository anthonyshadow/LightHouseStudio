// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ProjectCurrentResponse, ProjectSessionProposalContract } from '@studio/contracts';
import { projectMediaReferenceKey, type Composition } from '@studio/domain';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudioDesignProvider } from '../../ui';
import type { ProjectClipMedia } from '../projects/projectClipMedia';
import type { ProjectSessionPort } from '../projects/useProjectSession';
import { CompositionSurface } from './CompositionSurface';

afterEach(cleanup);

const projectId = '3f1c9e2a-6d4b-4f8a-9c21-5b7e0d8a4c11';
const assetId = '79b94c02-d268-4201-a05b-1f3baa0caed1';
const otherAssetId = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f';
const clipId = (index: number) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;

const clipMedia = (filename: string, durationMs: number): ProjectClipMedia => ({
  contentUrl: `/api/projects/${projectId}/sources/${assetId}/content`,
  mimeType: 'video/mp4',
  filename,
  width: 1_920,
  height: 1_080,
  durationMs,
  hasAudio: true,
});

/** Two clips: [0, 4000) over one asset and [4000, 6500) over another. */
const composition = (): Composition => ({
  clips: [
    {
      id: clipId(1),
      media: { kind: 'asset', assetId },
      trim: { startMs: 0, endMs: 4_000 },
      audio: { level: 100, muted: false },
    },
    {
      id: clipId(2),
      media: { kind: 'asset', assetId: otherAssetId },
      trim: { startMs: 1_000, endMs: 3_500 },
      audio: { level: 100, muted: false },
    },
  ],
  subtitles: [],
});

const media = new Map<string, ProjectClipMedia>([
  [projectMediaReferenceKey({ kind: 'asset', assetId }), clipMedia('opening.mp4', 12_000)],
  [
    projectMediaReferenceKey({ kind: 'asset', assetId: otherAssetId }),
    clipMedia('closing.mp4', 9_000),
  ],
]);

const current = (
  arrangement: Composition | null,
  presentedMedia: { kind: 'asset'; assetId: string } | null = null,
): ProjectCurrentResponse =>
  ({
    project: {
      id: projectId,
      title: 'Arranged',
      status: 'draft',
      version: 3,
      currentRevisionId: 'e2b1a5c7-8d9e-4f01-a2b3-c4d5e6f70819',
      currentRevisionNumber: 3,
    },
    revision: { snapshot: { composition: arrangement, presentedMedia } },
  }) as unknown as ProjectCurrentResponse;

/**
 * A session that behaves like the real one for the only thing this surface uses it for: it stages a
 * proposal and reads it back, so a gesture's effect is visible on the next render exactly as an
 * autosaved checkpoint would be.
 */
const createSession = (arrangement: Composition | null) => {
  let proposal: ProjectSessionProposalContract | null = null;
  const propose = vi.fn((patch: Partial<ProjectSessionProposalContract>) => {
    proposal = { ...(proposal ?? {}), ...patch } as ProjectSessionProposalContract;
    rerender?.();
    return true;
  });
  let rerender: (() => void) | undefined;
  const port = {
    projectId,
    phase: 'saved' as const,
    get proposal() {
      return proposal;
    },
    hasLocalProposal: false,
    message: null,
    propose,
    flush: () => Promise.resolve(true),
    retry: () => Promise.resolve(true),
    discard: () => true,
    getCurrent: () => current(arrangement),
    acceptCurrent: () => undefined,
    current: current(arrangement),
  } as unknown as ProjectSessionPort;
  return {
    port,
    propose,
    staged: () => proposal?.composition ?? null,
    bind: (fn: () => void) => {
      rerender = fn;
    },
  };
};

const renderSurface = (
  arrangement: Composition | null = composition(),
  overrides: {
    readonly archived?: boolean;
    readonly presentedMedia?: { kind: 'asset'; assetId: string } | null;
  } = {},
) => {
  const presentedMedia = overrides.presentedMedia ?? null;
  const session = createSession(arrangement);
  const onClose = vi.fn();
  const view = render(
    <StudioDesignProvider>
      <CompositionSurface
        current={current(arrangement, presentedMedia)}
        session={session.port}
        media={media}
        archived={overrides.archived ?? false}
        onClose={onClose}
        createId={() => clipId(9)}
      />
    </StudioDesignProvider>,
  );
  session.bind(() =>
    view.rerender(
      <StudioDesignProvider>
        <CompositionSurface
          current={current(session.staged() ?? arrangement, presentedMedia)}
          session={session.port}
          media={media}
          archived={overrides.archived ?? false}
          onClose={onClose}
          createId={() => clipId(9)}
        />
      </StudioDesignProvider>,
    ),
  );
  return { session, onClose };
};

const clipOptions = () => within(screen.getByRole('listbox')).getAllByRole('option');

describe('CompositionSurface', () => {
  it('lists every clip in order, saying which position each holds and how long it runs', () => {
    renderSurface();
    const options = clipOptions();
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveTextContent('opening.mp4');
    expect(options[0]).toHaveTextContent('Clip 1 of 2');
    // The trimmed span, not the media's own length: 4s and 2.5s.
    expect(options[0]).toHaveTextContent('00:04.00');
    expect(options[1]).toHaveTextContent('00:02.50');
    expect(screen.getByRole('heading', { name: 'Arrange' })).toBeVisible();
    expect(screen.getByText('2 clips · 00:06.50')).toBeVisible();
  });

  it('selects a clip, and the arrow keys move the selection along the strip', () => {
    renderSurface();
    fireEvent.click(clipOptions()[0]!);
    expect(clipOptions()[0]).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(clipOptions()[0]!, { key: 'ArrowRight' });
    expect(clipOptions()[1]).toHaveAttribute('aria-selected', 'true');
    // Roving tabindex: exactly one stop for the whole strip.
    expect(clipOptions().filter((option) => option.getAttribute('tabindex') === '0')).toHaveLength(
      1,
    );
  });

  it('reorders with Alt and the arrow keys, and says where the clip landed', () => {
    const { session } = renderSurface();
    fireEvent.click(clipOptions()[0]!);
    fireEvent.keyDown(clipOptions()[0]!, { key: 'ArrowRight', altKey: true });

    expect(session.staged()?.clips.map(({ id }) => id)).toEqual([clipId(2), clipId(1)]);
    expect(clipOptions()[0]).toHaveTextContent('closing.mp4');
    expect(screen.getByText('Clip moved to position 2 of 2.')).toBeInTheDocument();
  });

  it('offers the move buttons only where there is somewhere to move to', () => {
    renderSurface();
    fireEvent.click(clipOptions()[0]!);
    expect(screen.getByRole('button', { name: 'Move earlier' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move later' })).toBeEnabled();
  });

  it('refuses a split on a cut and names why, then cuts the clip the playhead is inside', () => {
    const { session } = renderSurface();
    const split = screen.getByRole('button', { name: 'Split at playhead' });
    // The playhead starts at 0, which is the first clip's own start — there is no cut to make.
    expect(split).toBeDisabled();
    expect(screen.getByText(/already on a cut/u)).toBeVisible();

    fireEvent.change(screen.getByRole('slider', { name: 'Playhead' }), {
      target: { value: '1500' },
    });
    expect(screen.getByRole('button', { name: 'Split at playhead' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Split at playhead' }));

    const clips = session.staged()?.clips ?? [];
    expect(clips.map(({ id }) => id)).toEqual([clipId(1), clipId(9), clipId(2)]);
    // The halves meet where the playhead was, and the left one keeps the id.
    expect(clips[0]?.trim).toEqual({ startMs: 0, endMs: 1_500 });
    expect(clips[1]?.trim).toEqual({ startMs: 1_500, endMs: 4_000 });
  });

  it('trims the selected clip in its own media time', () => {
    const { session } = renderSurface();
    fireEvent.click(clipOptions()[1]!);
    fireEvent.change(screen.getByRole('slider', { name: 'Clip ends at' }), {
      target: { value: '3000' },
    });
    expect(session.staged()?.clips[1]?.trim).toEqual({ startMs: 1_000, endMs: 3_000 });
  });

  it('mutes one clip without touching its level or its neighbours', () => {
    const { session } = renderSurface();
    fireEvent.click(clipOptions()[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Mute this clip' }));
    expect(session.staged()?.clips[0]?.audio).toEqual({ level: 100, muted: true });
    expect(session.staged()?.clips[1]?.audio).toEqual({ level: 100, muted: false });
  });

  it('un-arranges the Project when the last clip is removed, rather than keeping an empty one', () => {
    const { session } = renderSurface({ ...composition(), clips: [composition().clips[0]!] });
    fireEvent.click(clipOptions()[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Remove this clip' }));
    expect(session.propose).toHaveBeenCalledWith({ composition: null });
    expect(screen.getByText(/no longer arranged/u)).toBeInTheDocument();
  });

  it('says so when a clip stands over media this Project can no longer open', () => {
    const orphaned: Composition = {
      ...composition(),
      clips: [
        {
          ...composition().clips[0]!,
          media: { kind: 'asset', assetId: 'deadbeef-0000-4000-8000-000000000000' },
        },
      ],
    };
    renderSurface(orphaned);
    expect(clipOptions()[0]).toHaveAttribute('data-unresolved', 'true');
    fireEvent.click(clipOptions()[0]!);
    expect(screen.getByText(/can no longer open/u)).toBeVisible();
  });

  it('states that an archived Project is read-only and disables every way to change it', () => {
    renderSurface(composition(), { archived: true });
    fireEvent.click(clipOptions()[0]!);
    expect(screen.getByText(/This Project is archived/u)).toBeVisible();
    for (const name of ['Remove this clip', 'Move later', 'Mute this clip']) {
      expect(screen.getByRole('button', { name })).toBeDisabled();
    }
  });

  it('offers a way back to the Project, and says plainly when there is no video to arrange', () => {
    const { onClose } = renderSurface(null);
    expect(screen.getByText(/no video to arrange/u)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Arrange this video' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Back to the Project' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('arranges an unarranged Project from the video it already works from, on the press', () => {
    const { session } = renderSurface(null, {
      presentedMedia: { kind: 'asset', assetId },
    });
    // Nothing is written by looking: a Project is arranged when the operator says so.
    expect(session.propose).not.toHaveBeenCalled();
    expect(screen.getByText(/works from “opening.mp4”/u)).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Arrange this video' }));

    // One clip over that media, trimmed to the whole of it, so the arrangement renders to exactly
    // what the Project produces today.
    expect(session.staged()).toEqual({
      clips: [
        {
          id: clipId(9),
          media: { kind: 'asset', assetId },
          trim: { startMs: 0, endMs: 12_000 },
          audio: { level: 100, muted: false },
        },
      ],
      subtitles: [],
    });
    expect(within(screen.getByRole('listbox')).getAllByRole('option')).toHaveLength(1);
  });
});
