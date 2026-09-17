// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ProjectCurrentResponse, ProjectSessionProposalContract } from '@studio/contracts';
import type { Composition } from '@studio/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StudioDesignProvider } from '../../ui';
import { clipMediaEntryFixture, clipMediaFixture } from '../../test/compositionFixtures';
import type { ProjectClipMediaEntry } from '../projects/projectClipMedia';
import type { ProjectSessionPort } from '../projects/useProjectSession';
import { CompositionSurface } from './CompositionSurface';
import type * as RenderCompositionModule from './renderComposition';
import type { RenderCompositionInput, RenderCompositionResult } from './renderComposition';
import type { CompositionRenderPlan } from './types';

/*
 * The render is this surface's collaborator, not its subject: the client and the loop have their
 * own suites. The probe is stated rather than run — in jsdom the real one answers false, since
 * there is no WebGL to find — and the validator is stated to accept, because the file is a fake.
 */
const mocks = vi.hoisted(
  (): {
    support: boolean | null;
    renderComposition: ReturnType<
      typeof vi.fn<(input: RenderCompositionInput) => Promise<RenderCompositionResult>>
    >;
  } => ({
    support: true,
    renderComposition: vi.fn(),
  }),
);
vi.mock('./useVideoEditExportSupport', () => ({
  useVideoEditExportSupport: () => mocks.support,
}));
vi.mock('./renderComposition', async () => {
  const actual = await vi.importActual<typeof RenderCompositionModule>('./renderComposition');
  return {
    ...actual,
    renderComposition: (input: RenderCompositionInput) => mocks.renderComposition(input),
  };
});
vi.mock('../existing-video/videoValidation', () => ({
  validateEditedVideoOutput: () => Promise.resolve({}),
}));

beforeEach(() => {
  mocks.support = true;
  mocks.renderComposition.mockReset();
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => 'blob:rendered-arrangement'),
  });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
});

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(URL, 'createObjectURL');
  Reflect.deleteProperty(URL, 'revokeObjectURL');
});

/** A render the test settles by hand, exposing what the surface handed it. */
const deferredRender = () => {
  let resolve!: (result: RenderCompositionResult) => void;
  let reject!: (error: unknown) => void;
  let input!: RenderCompositionInput;
  mocks.renderComposition.mockImplementation((given) => {
    input = given;
    return new Promise<RenderCompositionResult>((res, rej) => {
      resolve = res;
      reject = rej;
    });
  });
  return {
    resolve: (result: RenderCompositionResult) => resolve(result),
    reject: (error: unknown) => reject(error),
    input: () => input,
  };
};

const plan = (overrides: Partial<CompositionRenderPlan> = {}): CompositionRenderPlan => ({
  durationMs: 6_500,
  video: { target: { width: 1_920, height: 1_080 }, clips: ['kept', 'kept'] },
  audio: {
    target: { sampleRate: 48_000, numberOfChannels: 2 },
    fellBack: false,
    clips: ['kept', 'kept'],
  },
  ...overrides,
});

const renderControl = () => screen.getByRole('button', { name: 'Render arrangement' });

const projectId = '3f1c9e2a-6d4b-4f8a-9c21-5b7e0d8a4c11';
const assetId = '79b94c02-d268-4201-a05b-1f3baa0caed1';
const otherAssetId = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f';
const clipId = (index: number) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;

const clipMedia = (filename: string, durationMs: number) =>
  clipMediaFixture(projectId, assetId, filename, { durationMs });

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

/** The Project's media, in the order it lists it: the two the clips stand over. */
const media = new Map<string, ProjectClipMediaEntry>([
  clipMediaEntryFixture({ kind: 'asset', assetId }, clipMedia('opening.mp4', 12_000)),
  clipMediaEntryFixture({ kind: 'asset', assetId: otherAssetId }, clipMedia('closing.mp4', 9_000)),
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
    revision: {
      revisionNumber: 3,
      // The surface reads it for the save stamp; the contract always carries one.
      snapshot: { composition: arrangement, presentedMedia, updatedAt: '2026-09-16T14:11:00.000Z' },
    },
  }) as unknown as ProjectCurrentResponse;

/**
 * A session that behaves like the real one for the only thing this surface uses it for: it stages a
 * proposal and reads it back, so a gesture's effect is visible on the next render exactly as an
 * autosaved checkpoint would be.
 */
const createSession = (
  arrangement: Composition | null,
  phase: ProjectSessionPort['phase'] = 'saved',
) => {
  let proposal: ProjectSessionProposalContract | null = null;
  const propose = vi.fn((patch: Partial<ProjectSessionProposalContract>) => {
    proposal = { ...(proposal ?? {}), ...patch } as ProjectSessionProposalContract;
    rerender?.();
    return true;
  });
  let rerender: (() => void) | undefined;
  const retry = vi.fn(() => Promise.resolve(true));
  const discard = vi.fn(() => true);
  const port = {
    projectId,
    phase,
    get proposal() {
      return proposal;
    },
    hasLocalProposal: true,
    message: null,
    propose,
    flush: () => Promise.resolve(true),
    retry,
    discard,
    getCurrent: () => current(arrangement),
    acceptCurrent: () => undefined,
    current: current(arrangement),
  } as unknown as ProjectSessionPort;
  return {
    port,
    propose,
    retry,
    discard,
    /** What the surface would read: `null` only when nothing is staged at all. */
    proposed: (): { readonly composition: Composition | null } | null =>
      proposal === null ? null : { composition: proposal.composition ?? null },
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
    readonly onRenderingChange?: (busy: boolean) => void;
    readonly phase?: ProjectSessionPort['phase'];
  } = {},
) => {
  const presentedMedia = overrides.presentedMedia ?? null;
  const session = createSession(arrangement, overrides.phase);
  const onClose = vi.fn();
  const onRetryMedia = vi.fn();
  /*
   * Counting, and hoisted so the first render and every re-render share it. A fixed id made the
   * second minted thing a silent no-op, because the domain de-duplicates by id and an unchanged
   * arrangement stages nothing. `clipId(9)` is still the first id minted.
   */
  let minted = 8;
  const mintId = () => clipId((minted += 1));
  let archived = overrides.archived ?? false;
  // One tree for the first render and every re-render, so a staged proposal and a changed
  // `archived` reach the surface the same way the Project route would deliver them.
  const tree = () => (
    <StudioDesignProvider>
      <CompositionSurface
        current={current(session.proposed()?.composition ?? arrangement, presentedMedia)}
        session={session.port}
        media={media}
        mediaStatus="ready"
        onRetryMedia={onRetryMedia}
        archived={archived}
        onClose={onClose}
        createId={mintId}
        onRenderingChange={overrides.onRenderingChange}
      />
    </StudioDesignProvider>
  );
  const view = render(tree());
  session.bind(() => view.rerender(tree()));
  return {
    session,
    onClose,
    view,
    /** Archives the Project under the surface, the way another tab would. */
    archive: () => {
      archived = true;
      view.rerender(tree());
    },
  };
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

  it('un-arranges the Project when the last clip is removed, and shows it at once', () => {
    const { session } = renderSurface(
      { ...composition(), clips: [composition().clips[0]!] },
      { presentedMedia: { kind: 'asset', assetId } },
    );
    fireEvent.click(clipOptions()[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Remove this clip' }));
    expect(session.propose).toHaveBeenCalledWith({ composition: null });
    /*
     * The staged `null` is what the operator is looking at, without waiting for the autosave: the
     * strip is gone and the un-arranged screen is here. Read through the proposal rather than the
     * snapshot, this used to keep showing the clip that had just been removed.
     */
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.getByRole('button', { name: 'Arrange this video' })).toBeVisible();
  });

  it('adds one of the Project’s videos as the last clip, selects it, and says so', async () => {
    const { session } = renderSurface();
    fireEvent.click(clipOptions()[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Add a clip' }));

    const dialog = screen.getByRole('dialog', { name: 'Add a clip' });
    // Every video the Project holds, in its order, with what the render's policy will read from it.
    const rows = within(
      within(dialog).getByRole('list', { name: 'Videos in this Project' }),
    ).getAllByRole('button');
    expect(rows[0]).toHaveTextContent(/^opening\.mp4/u);
    expect(rows[0]).toHaveTextContent('1920×1080 · 00:12.00 · with sound');
    expect(rows[0]).toHaveTextContent('Already in this arrangement as 1 clip.');
    expect(rows[1]).toHaveTextContent(/^closing\.mp4/u);

    fireEvent.click(rows[1]!);
    // The panel leaves after its exit transition; the surface behind it is inert until it has, so
    // nothing is said there yet — a live region written under `aria-hidden` is written to no one.
    expect(screen.queryByText(/^Added “closing\.mp4”/u)).toBeNull();
    // A second press while the panel is still leaving is not a second clip.
    fireEvent.click(rows[1]!);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    // The whole of the video, at the end, with the id the surface minted; the selection moves to
    // it and the playhead to where it starts.
    const clips = session.staged()?.clips ?? [];
    expect(clips.map(({ id }) => id)).toEqual([clipId(1), clipId(2), clipId(9)]);
    expect(clips[2]).toEqual({
      id: clipId(9),
      media: { kind: 'asset', assetId: otherAssetId },
      trim: { startMs: 0, endMs: 9_000 },
      audio: { level: 100, muted: false },
    });
    expect(clipOptions()).toHaveLength(3);
    expect(clipOptions()[2]).toHaveAttribute('aria-selected', 'true');
    expect(clipOptions()[2]).toHaveTextContent('Clip 3 of 3');
    expect(screen.getByRole('slider', { name: 'Playhead' })).toHaveValue('6500');
    // Said once the panel has gone, in a live region — `status` — where it can be heard.
    const said = await screen.findByText('Added “closing.mp4” as clip 3 of 3.');
    expect(said.closest('[role="status"]')).not.toBeNull();
    // The playhead sits on the new clip's own cut, so a split is refused there until it moves —
    // the same state choosing a clip from the strip leaves.
    expect(screen.getByRole('button', { name: 'Split at playhead' })).toBeDisabled();
    expect(screen.getByText(/already on a cut/u)).toBeVisible();
    // Focus lands on the clip that was added, which is now the strip's one tab stop.
    await waitFor(() => expect(clipOptions()[2]).toHaveFocus());
  });

  it('announces the same words twice when the same thing happens twice', () => {
    const three: Composition = {
      ...composition(),
      clips: [...composition().clips, { ...composition().clips[0]!, id: clipId(3) }],
    };
    renderSurface(three);
    fireEvent.click(clipOptions()[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Remove this clip' }));
    const first = screen.getByText('Clip removed from the arrangement.');
    fireEvent.click(clipOptions()[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Remove this clip' }));
    // The same sentence, but a new node: a live region that keeps the same text node says nothing
    // the second time, and React would not have touched it.
    const second = screen.getByText('Clip removed from the arrangement.');
    expect(second).not.toBe(first);
    expect(first).not.toBeInTheDocument();
    expect(clipOptions()).toHaveLength(1);
  });

  it('puts focus on the added clip even when that add fills the arrangement and disables the control', async () => {
    // Ids the surface's own minter (clip 9) does not collide with.
    const nearlyFull: Composition = {
      ...composition(),
      clips: Array.from({ length: 99 }, (_, index) => ({
        ...composition().clips[0]!,
        id: clipId(index + 100),
      })),
    };
    renderSurface(nearlyFull);
    const add = screen.getByRole('button', { name: 'Add a clip' });
    add.focus();
    fireEvent.click(add);
    fireEvent.click(screen.getByRole('button', { name: /^closing\.mp4/u }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(clipOptions()).toHaveLength(100);
    expect(add).toBeDisabled();
    await waitFor(() => expect(clipOptions()[99]).toHaveFocus());
  });

  it('says so when the session will not stage the add, since the Project route is hidden', async () => {
    const { session } = renderSurface();
    session.propose.mockReturnValueOnce(false);
    fireEvent.click(screen.getByRole('button', { name: 'Add a clip' }));
    fireEvent.click(screen.getByRole('button', { name: /^closing\.mp4/u }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('alert')).toHaveTextContent(
      'That video could not be added. Your arrangement is unchanged.',
    );
    // And said aloud once the panel has gone, since the alert was raised while the page was inert.
    await waitFor(() =>
      expect(
        screen
          .getAllByText('That video could not be added. Your arrangement is unchanged.')
          .filter((node) => node.closest('[role="status"]') !== null),
      ).toHaveLength(1),
    );
    expect(clipOptions()).toHaveLength(2);
    // The next attempt starts clean.
    fireEvent.click(screen.getByRole('button', { name: 'Add a clip' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('refuses to add to a full arrangement, with one reason that the split shares', () => {
    const full: Composition = {
      ...composition(),
      clips: Array.from({ length: 100 }, (_, index) => ({
        ...composition().clips[0]!,
        id: clipId(index + 1),
      })),
    };
    renderSurface(full);
    const add = screen.getByRole('button', { name: 'Add a clip' });
    expect(add).toBeDisabled();
    expect(add).toHaveAttribute('aria-describedby', 'composition-full-reason');
    const split = screen.getByRole('button', { name: 'Split at playhead' });
    expect(split).toBeDisabled();
    expect(split).toHaveAttribute('aria-describedby', 'composition-full-reason');
    // Once, not once per control.
    expect(screen.getAllByText(/holds as many clips as it can/u)).toHaveLength(1);
    expect(screen.queryByText(/Cannot split here/u)).toBeNull();
  });

  it('closes the picker without adding, and hands focus back to the control that opened it', async () => {
    const { session } = renderSurface();
    const add = screen.getByRole('button', { name: 'Add a clip' });
    add.focus();
    fireEvent.click(add);
    expect(screen.getByRole('dialog', { name: 'Add a clip' })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(session.propose).not.toHaveBeenCalled();
    await waitFor(() => expect(add).toHaveFocus());
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
    // Beside the render control, before any clip is selected: a disabled button with its reason.
    expect(renderControl()).toBeDisabled();
    expect(renderControl()).toHaveAttribute('aria-describedby', 'composition-render-reason');
    expect(
      screen.getByText(/1 clip stands over media this Project can no longer open/u),
    ).toBeVisible();
    fireEvent.click(clipOptions()[0]!);
    expect(screen.getByRole('alert')).toHaveTextContent(/can no longer open/u);
  });

  it('keeps Undo and Redo off a Project that was archived under the operator', () => {
    const view = renderSurface();
    fireEvent.click(clipOptions()[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Move later' }));
    expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled();

    // Archived from another tab, with the history still in hand: a press would stage a change the
    // server refuses, and the refusal would be invisible here.
    view.archive();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Redo' })).toBeDisabled();
  });

  it('never steps back past the arrangement’s own beginning', () => {
    const { session } = renderSurface(null, { presentedMedia: { kind: 'asset', assetId } });
    fireEvent.click(screen.getByRole('button', { name: 'Arrange this video' }));
    expect(clipOptions()).toHaveLength(1);
    // The un-arranged screen carries no Redo, so stepping into it would strand the history.
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
    expect(session.propose).toHaveBeenCalledTimes(1);
  });

  it('says why an archived Project that was never arranged cannot be', () => {
    renderSurface(null, { archived: true, presentedMedia: { kind: 'asset', assetId } });
    const arrange = screen.getByRole('button', { name: 'Arrange this video' });
    expect(arrange).toBeDisabled();
    expect(arrange).toHaveAttribute('aria-describedby', 'composition-archived-reason');
    expect(
      screen.getByText('This Project is archived. Restore it before arranging this video.'),
    ).toBeVisible();
  });

  it('says whether the arrangement is saved, where the masthead that normally says it is hidden', () => {
    renderSurface();
    expect(document.querySelector('[data-composition-save-status]')).toHaveTextContent(
      /^Autosaved · /u,
    );
  });

  it('reports a save that is still in flight, and one that failed, on this surface', () => {
    const saving = renderSurface(composition(), { phase: 'saving' });
    expect(document.querySelector('[data-composition-save-status]')).toHaveTextContent(
      'Autosaving…',
    );
    saving.view.unmount();

    renderSurface(composition(), { phase: 'error' });
    expect(document.querySelector('[data-composition-save-status]')).toHaveTextContent(
      'Not autosaved',
    );
  });

  it('offers the conflict choice in place, rather than only when leaving', () => {
    const { session } = renderSurface(composition(), { phase: 'conflict' });
    const notice = screen.getByRole('alert');
    expect(notice).toHaveTextContent('Conflict');
    fireEvent.click(within(notice).getByRole('button', { name: 'Reapply changes' }));
    expect(session.retry).toHaveBeenCalled();
    fireEvent.click(within(notice).getByRole('button', { name: 'Discard local changes' }));
    expect(session.discard).toHaveBeenCalled();
  });

  it('states that an archived Project is read-only and disables every way to change it', () => {
    renderSurface(composition(), { archived: true });
    fireEvent.click(clipOptions()[0]!);
    expect(screen.getByText(/This Project is archived/u)).toBeVisible();
    for (const name of ['Remove this clip', 'Move later', 'Mute this clip', 'Add a clip']) {
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

  it('refuses to render an arrangement past the five-minute ceiling, before paying for it', () => {
    /*
     * Reachable in two gestures: a source is capped at five minutes, not less, and Add a clip
     * appends the whole of one. This used to render in full and then refuse with the intake's
     * words about choosing a shorter video.
     */
    const long: Composition = {
      ...composition(),
      clips: [
        { ...composition().clips[0]!, trim: { startMs: 0, endMs: 200_000 } },
        { ...composition().clips[1]!, trim: { startMs: 0, endMs: 150_000 } },
      ],
    };
    renderSurface(long);
    expect(renderControl()).toBeDisabled();
    expect(renderControl()).toHaveAttribute('aria-describedby', 'composition-render-reason');
    expect(screen.getByText(/This arrangement runs to 05:50\.00/u)).toBeVisible();
    expect(mocks.renderComposition).not.toHaveBeenCalled();

    // Trimmed back under the ceiling, the same control is live again.
    fireEvent.click(clipOptions()[0]!);
    fireEvent.change(screen.getByRole('slider', { name: 'Clip ends at' }), {
      target: { value: '100000' },
    });
    expect(renderControl()).toBeEnabled();
  });

  it('offers the render once the browser has answered, and says why when it cannot render', () => {
    mocks.support = null;
    const first = renderSurface();
    expect(renderControl()).toBeDisabled();
    expect(screen.queryByText(/cannot render this arrangement/u)).toBeNull();
    first.view.unmount();

    mocks.support = false;
    renderSurface();
    expect(renderControl()).toBeDisabled();
    expect(
      screen.getByText(/cannot render this arrangement without blocking the Studio/u),
    ).toBeVisible();
  });

  it('renders the arrangement as it stands, shows its progress and plan, and can be cancelled', async () => {
    const deferred = deferredRender();
    const onRenderingChange = vi.fn();
    renderSurface(composition(), { onRenderingChange });
    expect(onRenderingChange).toHaveBeenLastCalledWith(false);

    fireEvent.click(renderControl());
    const input = deferred.input();
    // The arrangement itself, its cues, and each clip's media in sequence order, absolute.
    expect(input.composition).toEqual(composition());
    expect(
      input.media.map(({ url, filename, width, height }) => ({ url, filename, width, height })),
    ).toEqual([
      {
        url: `${window.location.origin}/api/projects/${projectId}/sources/${assetId}/content`,
        filename: 'opening.mp4',
        width: 1_920,
        height: 1_080,
      },
      {
        url: `${window.location.origin}/api/projects/${projectId}/sources/${assetId}/content`,
        filename: 'closing.mp4',
        width: 1_920,
        height: 1_080,
      },
    ]);
    expect(onRenderingChange).toHaveBeenLastCalledWith(true);
    expect(screen.getByText('Rendering the arrangement')).toBeVisible();
    act(() => {
      input.onPlan?.(plan());
      input.onProgress(0.42);
    });
    expect(screen.getByText('42%')).toBeVisible();
    expect(screen.getByText(/Rendering at 1920×1080, sound at 48 kHz stereo/u)).toBeVisible();
    // Nothing may change the arrangement underneath a render.
    fireEvent.click(clipOptions()[0]!);
    for (const name of [
      'Split at playhead',
      'Add a clip',
      'Undo',
      'Remove this clip',
      'Mute this clip',
    ]) {
      expect(screen.getByRole('button', { name })).toBeDisabled();
    }
    expect(screen.getByRole('slider', { name: 'Clip volume' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel render' }));
    expect(input.signal.aborted).toBe(true);
    await act(() => {
      deferred.reject(new DOMException('Video rendering was canceled.', 'AbortError'));
      return Promise.resolve();
    });
    expect(screen.queryByText('Rendering the arrangement')).toBeNull();
    expect(screen.getByRole('button', { name: 'Remove this clip' })).toBeEnabled();
    expect(onRenderingChange).toHaveBeenLastCalledWith(false);
  });

  it('plays the rendered file with its frame and length, says what the render did to a clip, and marks it stale after a change', async () => {
    const deferred = deferredRender();
    renderSurface(composition());
    fireEvent.click(renderControl());
    const rendered = plan({
      video: { target: { width: 1_920, height: 1_080 }, clips: ['kept', 'letterboxed'] },
      audio: {
        target: { sampleRate: 48_000, numberOfChannels: 2 },
        fellBack: true,
        clips: ['resampled-and-remixed', 'silence'],
      },
    });
    await act(() => {
      deferred.input().onPlan?.(rendered);
      deferred.resolve({
        blob: new Blob(['mp4'], { type: 'video/mp4' }),
        mimeType: 'video/mp4',
        plan: rendered,
      });
      return Promise.resolve();
    });
    expect(await screen.findByText(/Rendered from 2 clips · 00:06\.50 · 1920×1080/u)).toBeVisible();
    expect(screen.getByText(/renders at 1920×1080/u)).toBeVisible();
    expect(
      screen.getByText(/Sound is encoded at 48 kHz stereo because this browser cannot encode/u),
    ).toBeVisible();
    // The plan's labels, in words, under the selected clip.
    fireEvent.click(clipOptions()[0]!);
    expect(screen.getByText('Its sound is resampled to 48 kHz.')).toBeVisible();
    expect(screen.getByText('Its sound is folded to stereo.')).toBeVisible();
    fireEvent.click(clipOptions()[1]!);
    expect(
      screen.getByText(
        /Shown with bars: its shape differs from the arrangement's 1920×1080 frame/u,
      ),
    ).toBeVisible();
    expect(screen.getByText('Silent in the render.')).toBeVisible();
    expect(screen.queryByText(/Arrangement changed/u)).toBeNull();

    // A gesture after the render: the file stays playable, and it says it is behind.
    fireEvent.click(screen.getByRole('button', { name: 'Mute this clip' }));
    expect(screen.getByText(/rendered before your last change/u)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Render again' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Back to editing' }));
    expect(screen.queryByText(/Rendered from 2 clips/u)).toBeNull();
    expect(screen.getByText(/Showing the selected clip/u)).toBeVisible();
  });

  it('says the render failed in the worker’s words, that nothing changed, and offers to try again', async () => {
    const deferred = deferredRender();
    renderSurface(composition());
    fireEvent.click(renderControl());
    await act(() => {
      deferred.reject(new Error('“opening.mp4” uses video this browser cannot decode.'));
      return Promise.resolve();
    });
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(
      '“opening.mp4” uses video this browser cannot decode. Nothing in this Project was changed.',
    );
    expect(within(alert).getByRole('button', { name: 'Try again' })).toBeEnabled();
    fireEvent.click(within(alert).getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('lets an archived Project render a preview, since a render writes nothing', () => {
    renderSurface(composition(), { archived: true });
    expect(renderControl()).toBeEnabled();
    expect(screen.getByText(/You can still render a preview/u)).toBeVisible();
  });
});
