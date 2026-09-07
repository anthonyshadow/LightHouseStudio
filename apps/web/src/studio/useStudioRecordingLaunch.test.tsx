// @vitest-environment jsdom

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { projectWorkspacePath } from '../app/paths';
import type { ProjectSourceActivity } from '../features/projects/useProjectSourceController';
import type { PresentedRecordingArtifact, RecordingArtifact } from '../features/recording/types';
import { takeDiscardQuestion } from '../features/take-review/takeDiscardQuestion';
import type { ConfirmationRequest, ConfirmationRequestOptions } from '../ui';
import { useStudioRecordingLaunch } from './useStudioRecordingLaunch';

const router = vi.hoisted(() => ({ navigate: vi.fn() }));

vi.mock('react-router', () => ({
  useNavigate: () => router.navigate,
  // Fixed, because the record-intent effect is not what any of this file's cases are about: a
  // create entry carrying no `?intent=record` leaves it inert while every press below runs.
  useLocation: () => ({
    pathname: '/studio/create',
    search: '',
    hash: '',
    state: null,
    key: 'launch-test',
  }),
}));

const projectId = '18b120ac-1578-46e3-8c3d-42307772f391';
const otherProjectId = '730c73ca-a6af-4509-83c0-b3c18c1ee81a';

type LaunchOptions = Parameters<typeof useStudioRecordingLaunch>[0];
type LaunchRecording = LaunchOptions['recording'];
type LaunchSession = LaunchOptions['session'];
type LaunchExistingVideo = LaunchOptions['existingVideo'];

const ownedArtifact = (): RecordingArtifact => {
  const media = new Blob(['take'], { type: 'video/webm' });
  return {
    id: 'take-1',
    media,
    objectUrl: 'blob:take-1',
    mimeType: media.type,
    filename: 'take.webm',
    sourceModeId: 'local',
    startedAt: '2026-09-07T10:00:00.000Z',
    durationMs: 2_500,
    sizeBytes: media.size,
  };
};

/**
 * A Project source streamed over HTTP: presentable, but not bytes this runtime holds. The launch
 * asks no question before dropping one, because nothing unrecoverable goes with it.
 */
const streamedSource = (): PresentedRecordingArtifact => ({
  id: 'project-source',
  media: {
    kind: 'remote-presentation',
    contentUrl: `/api/projects/${projectId}/source/content`,
    sizeBytes: 4,
    mimeType: 'video/mp4',
  },
  objectUrl: `/api/projects/${projectId}/source/content`,
  mimeType: 'video/mp4',
  filename: 'streamed.mp4',
  sourceModeId: 'local',
  startedAt: '2026-09-07T10:00:00.000Z',
  durationMs: 2_500,
  sizeBytes: 4,
});

const sourceActivity = (overrides: Partial<ProjectSourceActivity> = {}): ProjectSourceActivity => ({
  projectId,
  accepted: false,
  phase: 'idle',
  busy: false,
  abort: null,
  ...overrides,
});

/**
 * The shell's confirmation, with the answer held open.
 *
 * Every case that matters here happens between the question and its answer — the Project moving,
 * the runtime unmounting — so the double hands back a resolver rather than settling on its own.
 */
const confirmationHarness = () => {
  const answers: ((confirmed: boolean) => void)[] = [];
  const ask = vi.fn(
    (_question: ConfirmationRequestOptions) =>
      new Promise<boolean>((resolve) => {
        answers.push(resolve);
      }),
  );
  const answer = (confirmed: boolean): void => {
    answers.shift()?.(confirmed);
  };
  const confirmation: ConfirmationRequest = {
    pending: null,
    ask,
    confirm: () => answer(true),
    cancel: () => answer(false),
  };
  return { confirmation, ask, answer };
};

/**
 * Built whole rather than narrowed, because `discard`'s boolean is the thing under test: a partial
 * double closed by an assertion is exactly what would hide a member this hook starts reading.
 */
const recordingDouble = (
  presented: PresentedRecordingArtifact | null,
  discard: () => boolean,
): LaunchRecording => ({
  lifecycle: presented ? 'recorded' : 'idle',
  activeSource: null,
  metadata: null,
  original: presented,
  visual: null,
  processed: null,
  presented,
  sidecar: { state: 'unavailable', blob: null, mimeType: null, error: null },
  recordingError: null,
  processingState: 'idle',
  processingOperation: null,
  processingError: null,
  elapsedSeconds: 0,
  start: vi.fn(() => Promise.resolve()),
  stop: vi.fn(() => Promise.resolve(null)),
  restorePersistedOriginal: vi.fn(() => ownedArtifact()),
  presentRemoteOriginal: vi.fn(() => ownedArtifact()),
  completeSourceValidation: vi.fn(() => ownedArtifact()),
  replaceSource: vi.fn(() => ownedArtifact()),
  discard,
  beginProcessing: vi.fn(),
  cancelProcessing: vi.fn(),
  completeVisualProcessing: vi.fn(() => ownedArtifact()),
  completeProcessing: vi.fn(() => ownedArtifact()),
  failProcessing: vi.fn(),
  repairPresentedObjectUrl: vi.fn(() => false),
  clearVisualProcessing: vi.fn(),
  restoreOriginal: vi.fn(),
});

/**
 * The two ports this hook barely touches, stood in for by the members it actually reads.
 *
 * A `Pick` rather than a free-hand object, so each member is still checked against the real port,
 * and one assertion each rather than sixty lines of unrelated session and workflow surface. The
 * pattern `useOwnedMediaAcquisition.test.tsx` already uses.
 */
const sessionDouble = (startLocal: () => Promise<void>): LaunchSession => {
  const double: Pick<LaunchSession, 'startLocal'> = { startLocal };
  return double as LaunchSession;
};

const existingVideoDouble = (): LaunchExistingVideo => {
  const double: Pick<
    LaunchExistingVideo,
    'selection' | 'steps' | 'addStep' | 'adoptRecordedArtifact'
  > = {
    selection: null,
    steps: [],
    addStep: vi.fn(() => true),
    adoptRecordedArtifact: vi.fn(() => Promise.resolve(true)),
  };
  return double as LaunchExistingVideo;
};

const capableBrowser: LaunchOptions['browser'] = {
  secureContext: true,
  mediaDevices: true,
  mediaRecorder: true,
  webAudio: true,
  offlineAudio: true,
};

interface SetupOptions {
  /** What the stage is holding when the press arrives. */
  readonly presented?: PresentedRecordingArtifact | null;
  /** What `recording.discard()` answers — false means a take still being finalized. */
  readonly discards?: boolean;
  readonly launch?: Partial<LaunchOptions>;
}

const setup = ({ presented = null, discards = true, launch = {} }: SetupOptions = {}) => {
  const discard = vi.fn(() => discards);
  const startLocal = vi.fn(() => Promise.resolve());
  const { confirmation, ask, answer } = confirmationHarness();
  const openOverlay = vi.fn();
  const closeOverlay = vi.fn();
  const focusMain = vi.fn();
  const defaults: LaunchOptions = {
    browser: capableBrowser,
    session: sessionDouble(startLocal),
    recording: recordingDouble(presented, discard),
    recordingActive: false,
    stagePresentationKind: 'idle',
    existingVideo: existingVideoDouble(),
    creationIntent: null,
    activeProjectId: projectId,
    projectSourceActivity: sourceActivity(),
    acquireOwnedMedia: vi.fn(() => Promise.resolve(true)),
    openOverlay,
    closeOverlay,
    focusMain,
    confirmation,
  };
  const hook = renderHook(
    (props: Partial<LaunchOptions>) => useStudioRecordingLaunch({ ...defaults, ...props }),
    { initialProps: launch },
  );

  return {
    hook,
    discard,
    startLocal,
    ask,
    answer,
    openOverlay,
    closeOverlay,
    focusMain,
    navigate: router.navigate,
  };
};

/** Lets the launch's immediately-invoked async half run on to its next suspension point. */
const settle = async (): Promise<void> => {
  await act(async () => {});
};

/** A press, then that same wait: the launch either finishes here or stops at the open question. */
const press = async (start: () => void): Promise<void> => {
  act(start);
  await settle();
};

beforeEach(() => {
  router.navigate.mockClear();
});

afterEach(cleanup);

describe('useStudioRecordingLaunch', () => {
  describe('startProjectRecording', () => {
    it('launches with no question when the stage is holding no take', async () => {
      const { hook, discard, startLocal, ask, closeOverlay, focusMain, navigate } = setup();

      await press(hook.result.current.startProjectRecording);

      expect(ask).not.toHaveBeenCalled();
      expect(discard).toHaveBeenCalledOnce();
      expect(closeOverlay).toHaveBeenCalledOnce();
      expect(navigate).toHaveBeenCalledWith(projectWorkspacePath(projectId));
      expect(focusMain).toHaveBeenCalledOnce();
      expect(startLocal).toHaveBeenCalledOnce();
    });

    it('leaves the take, the overlay and the route alone when the question is declined', async () => {
      const { hook, discard, startLocal, ask, answer, closeOverlay, navigate } = setup({
        presented: ownedArtifact(),
      });

      await press(hook.result.current.startProjectRecording);
      expect(ask).toHaveBeenCalledWith(takeDiscardQuestion('project-recording'));

      answer(false);
      await settle();

      expect(discard).not.toHaveBeenCalled();
      // Asked before any side effect, so declining costs the operator nothing at all.
      expect(closeOverlay).not.toHaveBeenCalled();
      expect(navigate).not.toHaveBeenCalled();
      expect(startLocal).not.toHaveBeenCalled();
    });

    it('discards before it navigates, and navigates before it asks for a camera', async () => {
      const { hook, discard, startLocal, answer, navigate } = setup({
        presented: ownedArtifact(),
      });

      await press(hook.result.current.startProjectRecording);
      answer(true);
      await settle();

      expect(discard).toHaveBeenCalledOnce();
      expect(navigate).toHaveBeenCalledWith(projectWorkspacePath(projectId));
      expect(startLocal).toHaveBeenCalledOnce();
      // The order is the guarantee: review never owns a take while a fresh stream is acquired for
      // the same stage.
      const [discarded = 0] = discard.mock.invocationCallOrder;
      const [navigated = 0] = navigate.mock.invocationCallOrder;
      const [started = 0] = startLocal.mock.invocationCallOrder;
      expect(discarded).toBeGreaterThan(0);
      expect(navigated).toBeGreaterThan(discarded);
      expect(started).toBeGreaterThan(navigated);
    });

    it('stops the launch when the runtime refuses to give up a still-finalizing take', async () => {
      const { hook, discard, startLocal, answer, closeOverlay, navigate } = setup({
        presented: ownedArtifact(),
        discards: false,
      });

      await press(hook.result.current.startProjectRecording);
      answer(true);
      await settle();

      expect(discard).toHaveBeenCalledOnce();
      // The take stays on the stage with its own review controls; nothing navigates away from it.
      expect(closeOverlay).not.toHaveBeenCalled();
      expect(navigate).not.toHaveBeenCalled();
      expect(startLocal).not.toHaveBeenCalled();
    });

    it('returns without asking while a recording is active', async () => {
      const { hook, discard, startLocal, ask, navigate } = setup({
        presented: ownedArtifact(),
        launch: { recordingActive: true },
      });

      await press(hook.result.current.startProjectRecording);

      expect(ask).not.toHaveBeenCalled();
      expect(discard).not.toHaveBeenCalled();
      expect(navigate).not.toHaveBeenCalled();
      expect(startLocal).not.toHaveBeenCalled();
    });

    it.each<[string, Partial<LaunchOptions>]>([
      ['the browser cannot capture', { browser: { ...capableBrowser, mediaRecorder: false } }],
      [
        'the Project source is already accepted',
        { projectSourceActivity: sourceActivity({ accepted: true }) },
      ],
      ['the Project source is busy', { projectSourceActivity: sourceActivity({ busy: true }) }],
    ])('returns before asking when %s', async (_reason, launch) => {
      const { hook, discard, startLocal, ask, navigate } = setup({
        presented: ownedArtifact(),
        launch,
      });

      await press(hook.result.current.startProjectRecording);

      expect(ask).not.toHaveBeenCalled();
      expect(discard).not.toHaveBeenCalled();
      expect(navigate).not.toHaveBeenCalled();
      expect(startLocal).not.toHaveBeenCalled();
    });

    it('abandons the launch when the Project moves under the open question', async () => {
      const { hook, discard, startLocal, ask, answer, navigate } = setup({
        presented: ownedArtifact(),
      });

      await press(hook.result.current.startProjectRecording);
      expect(ask).toHaveBeenCalledOnce();

      // The dialog is the shell's, so the route is free to move while it is open.
      hook.rerender({ activeProjectId: otherProjectId });
      answer(true);
      await settle();

      expect(discard).not.toHaveBeenCalled();
      expect(navigate).not.toHaveBeenCalled();
      expect(startLocal).not.toHaveBeenCalled();
    });

    it('abandons the launch when the runtime unmounts under the open question', async () => {
      const { hook, discard, startLocal, ask, answer, navigate } = setup({
        presented: ownedArtifact(),
      });

      await press(hook.result.current.startProjectRecording);
      expect(ask).toHaveBeenCalledOnce();

      // The one thing the mirrored guard cannot cover: the question belongs to the shell, which
      // outlives this runtime, so an accepted answer would otherwise acquire a stream that nothing
      // is left to stop.
      hook.unmount();
      answer(true);
      await settle();

      expect(discard).not.toHaveBeenCalled();
      expect(navigate).not.toHaveBeenCalled();
      expect(startLocal).not.toHaveBeenCalled();
    });

    it('drops a URL-backed Project source without a question', async () => {
      const { hook, discard, startLocal, ask, navigate } = setup({ presented: streamedSource() });

      await press(hook.result.current.startProjectRecording);

      // Durable on the server, so clearing the stage loses nothing worth asking about.
      expect(ask).not.toHaveBeenCalled();
      expect(discard).toHaveBeenCalledOnce();
      expect(navigate).toHaveBeenCalledWith(projectWorkspacePath(projectId));
      expect(startLocal).toHaveBeenCalledOnce();
    });
  });

  describe('restartCapture', () => {
    it('answers false and starts nothing when the take is still finalizing', () => {
      const { hook, discard, startLocal, closeOverlay } = setup({
        presented: ownedArtifact(),
        discards: false,
      });
      act(() => {
        hook.result.current.openPlaybackEditor('character-swap', 'create-card');
      });
      expect(hook.result.current.launchingOperation).toBe('character-swap');

      let restarted = true;
      act(() => {
        restarted = hook.result.current.restartCapture();
      });

      expect(restarted).toBe(false);
      expect(discard).toHaveBeenCalledOnce();
      expect(startLocal).not.toHaveBeenCalled();
      expect(closeOverlay).not.toHaveBeenCalled();
      // Nothing was destroyed, so the launch the take was pointing at is still armed.
      expect(hook.result.current.launchingOperation).toBe('character-swap');
    });

    it('discards the take and the armed handoff before it asks for a camera', () => {
      const { hook, discard, startLocal, closeOverlay, focusMain } = setup({
        presented: ownedArtifact(),
      });
      act(() => {
        hook.result.current.openPlaybackEditor('character-swap', 'create-card');
      });
      expect(hook.result.current.launchingOperation).toBe('character-swap');

      let restarted = false;
      act(() => {
        restarted = hook.result.current.restartCapture();
      });

      expect(restarted).toBe(true);
      expect(discard).toHaveBeenCalledOnce();
      // The handoff goes with the take: an armed Create launch must not outlive the take it named.
      expect(hook.result.current.launchingOperation).toBeNull();
      expect(hook.result.current.launchedOperation).toBeNull();
      expect(closeOverlay).toHaveBeenCalledOnce();
      expect(focusMain).toHaveBeenCalledOnce();
      expect(startLocal).toHaveBeenCalledOnce();
      const [discarded = 0] = discard.mock.invocationCallOrder;
      const [started = 0] = startLocal.mock.invocationCallOrder;
      expect(discarded).toBeGreaterThan(0);
      expect(started).toBeGreaterThan(discarded);
    });

    it('refuses on a browser that cannot capture, before the take is touched', () => {
      const { hook, discard, startLocal } = setup({
        presented: ownedArtifact(),
        launch: { browser: { ...capableBrowser, secureContext: false } },
      });
      expect(hook.result.current.captureSupported).toBe(false);

      let restarted = true;
      act(() => {
        restarted = hook.result.current.restartCapture();
      });

      // The guard sits ahead of the discard, so a take is never destroyed for a camera that
      // `startLocalRecording` would then decline to start.
      expect(restarted).toBe(false);
      expect(discard).not.toHaveBeenCalled();
      expect(startLocal).not.toHaveBeenCalled();
    });
  });
});
