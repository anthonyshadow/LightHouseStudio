import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { APP_PATHS, projectWorkspacePath, type StudioCreationIntent } from '../app/paths';
import type { BrowserCapabilities } from '../application/types';
import { ownedRecordingArtifact } from '../features/recording/types';
import type { useExistingVideoWorkflow } from '../features/existing-video/useExistingVideoWorkflow';
import type { ProjectCreateOperationId } from '../features/projects/ProjectRouteSurface';
import type { ProjectSourceActivity } from '../features/projects/useProjectSourceController';
import { takeDiscardQuestion } from '../features/take-review/takeDiscardQuestion';
import type { useStudioSession } from '../orchestration/session';
import type { ConfirmationRequest } from '../ui';
import type { useStudioOverlayController } from './useStudioOverlayController';
import type { useTakeReviewFlow } from './useTakeReviewFlow';

const VISUAL_MODEL_FOR_OPERATION = {
  'character-swap': 'lucy-latest',
  'virtual-try-on': 'lucy-vton-latest',
} as const;

/** Everything a Project launch is allowed to depend on, named so both reads of it agree. */
interface ProjectRecordingLaunchState {
  readonly activeProjectId: string | null;
  readonly projectSourceActivity: ProjectSourceActivity | null;
  readonly recordingActive: boolean;
  readonly captureSupported: boolean;
}

/**
 * The Project a capture may launch in, or `null` when none may.
 *
 * Answering the Project rather than a bare yes gives the caller an identity to carry across the
 * confirmation: asked a second time afterwards, an equal id is the whole re-check — still
 * permitted, and still the Project whose Record button was pressed.
 */
const launchableProjectId = ({
  activeProjectId,
  projectSourceActivity,
  recordingActive,
  captureSupported,
}: ProjectRecordingLaunchState): string | null =>
  activeProjectId !== null &&
  !projectSourceActivity?.accepted &&
  !projectSourceActivity?.busy &&
  // The exact proxy for "the discard is going to refuse", and already an option of this hook.
  !recordingActive &&
  captureSupported
    ? activeProjectId
    : null;

/** Which surface made a launch. Only the Create cards report their own as busy. */
export type StudioEditorLaunchOrigin = 'create-card' | 'rail';

interface UseStudioRecordingLaunchOptions {
  readonly browser: BrowserCapabilities;
  readonly session: ReturnType<typeof useStudioSession>;
  readonly recording: ReturnType<typeof useTakeReviewFlow>['recording'];
  readonly recordingActive: boolean;
  readonly stagePresentationKind: ReturnType<typeof useTakeReviewFlow>['stagePresentation']['kind'];
  readonly existingVideo: ReturnType<typeof useExistingVideoWorkflow>;
  readonly creationIntent: StudioCreationIntent | null;
  readonly activeProjectId: string | null;
  readonly projectSourceActivity: ProjectSourceActivity | null;
  /** Resolves true once the presented original is owned bytes; false on cancel or failure. */
  readonly acquireOwnedMedia: () => Promise<boolean>;
  readonly openOverlay: ReturnType<typeof useStudioOverlayController>['open'];
  readonly closeOverlay: ReturnType<typeof useStudioOverlayController>['close'];
  readonly focusMain: () => void;
  /**
   * The shell's confirmation, never a surface's: a Project launch navigates, and a question owned
   * by something the navigation tears down cannot survive to be answered.
   */
  readonly confirmation: ConfirmationRequest;
}

/**
 * Owns where a locally captured take goes once it exists.
 *
 * A capture can be started for the stage, for the post-recording editor, or for a Project source
 * slot, and the destination has to be decided before the artifact arrives. `recordingForExistingVideo`
 * carries that decision across the recording, and the adoption effect spends it exactly once when a
 * finalized take shows up.
 */
export const useStudioRecordingLaunch = ({
  browser,
  session,
  recording,
  recordingActive,
  stagePresentationKind,
  existingVideo,
  creationIntent,
  activeProjectId,
  projectSourceActivity,
  acquireOwnedMedia,
  openOverlay,
  closeOverlay,
  focusMain,
  confirmation,
}: UseStudioRecordingLaunchOptions) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [recordingForExistingVideo, setRecordingForExistingVideo] = useState(false);
  const adoptingRecordingRef = useRef<string | null>(null);
  // A Create-task launch outlives the click: the video may still be streaming, and adoption is
  // async. The request rides here until the editor is actually ready to receive it.
  const pendingCreateLaunchRef = useRef<ProjectCreateOperationId | null>(null);
  /**
   * The launch in flight, and the Project it was made in.
   *
   * Naming the Project is what makes "a request must not survive the Project it was made in" a fact
   * about the value rather than a cleanup that has to fire: read against the current one below, a
   * launch made elsewhere is simply not in flight here, and cannot strand a Project's launchers on
   * a card nobody pressed.
   */
  const [createLaunch, setCreateLaunch] = useState<{
    readonly projectId: string | null;
    readonly operation: ProjectCreateOperationId;
    readonly origin: StudioEditorLaunchOrigin;
  } | null>(null);
  const activeLaunch =
    createLaunch !== null && createLaunch.projectId === activeProjectId ? createLaunch : null;
  /** The launch to dispatch, whichever surface made it. */
  const launchedOperation = activeLaunch?.operation ?? null;
  /**
   * The launch the Create surface may report as its own.
   *
   * Only a card press belongs to that surface: reporting a rail press here made the "Edit video"
   * card read busy and disabled its neighbours for a launch nobody made there.
   */
  const launchingOperation = activeLaunch?.origin === 'create-card' ? activeLaunch.operation : null;
  /**
   * Ends a launch — one that arrived, and one that never will.
   *
   * Both halves always move together. Clearing the ref alone and leaving the state set, on the
   * grounds that the surface hides it while the editor is up, stranded every Create launcher the
   * moment that editor closed.
   */
  const clearCreateLaunch = useCallback(() => {
    pendingCreateLaunchRef.current = null;
    setCreateLaunch(null);
  }, []);
  const captureSupported = Boolean(
    browser.mediaRecorder && browser.mediaDevices && browser.secureContext,
  );

  /**
   * The launch guard's inputs as of the last commit.
   *
   * A Project launch now awaits an answer, and the dialog that gives it belongs to the shell, so
   * the route can move while it is open. The closure that asked the question therefore knows only
   * what was true when it was asked; this is what is true when it is answered.
   */
  const launchStateRef = useRef<ProjectRecordingLaunchState>({
    activeProjectId,
    projectSourceActivity,
    recordingActive,
    captureSupported,
  });
  /**
   * Whether this runtime is still on screen.
   *
   * The one thing the mirrored guard cannot cover. `useAwaitableQuestion` resolves `false` at its
   * own owner's unmount, and that owner is the shell, which outlives the Studio runtime; a stream
   * acquired after this runtime has gone would have nothing left to stop it.
   */
  const mountedRef = useRef(true);
  useLayoutEffect(() => {
    launchStateRef.current = {
      activeProjectId,
      projectSourceActivity,
      recordingActive,
      captureSupported,
    };
  }, [activeProjectId, captureSupported, projectSourceActivity, recordingActive]);
  useLayoutEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const artifact = recording.original;
    // A Project autosave landing mid-handoff re-presents the source as a URL, which drops the bytes
    // this launch was already waiting on. Asking again is safe — the acquisition returns its own
    // in-flight promise for the same artifact — and without it the launch waits for a fetch nobody
    // is going to start, leaving the card busy for good.
    if (
      recordingForExistingVideo &&
      artifact &&
      pendingCreateLaunchRef.current !== null &&
      ownedRecordingArtifact(artifact) === null
    ) {
      void acquireOwnedMedia().then((acquired) => {
        if (!acquired) clearCreateLaunch();
      });
    }
    if (
      !recordingForExistingVideo ||
      !artifact ||
      // Adoption validates complete media, so a URL-backed presentation waits here until the
      // deferred acquisition republishes it as owned bytes.
      ownedRecordingArtifact(artifact) === null ||
      existingVideo.selection ||
      stagePresentationKind !== 'playback' ||
      adoptingRecordingRef.current === artifact.id
    ) {
      return;
    }

    adoptingRecordingRef.current = artifact.id;
    // Captured before the adoption settles: a launch armed at this moment owns its own exit (the
    // pre-arm or spend effect), and reading the ref afterwards raced them — a spent launch read
    // back as null and opened the chooser on top of the editor it had just launched.
    const request = pendingCreateLaunchRef.current;
    void existingVideo.adoptRecordedArtifact().then((adopted) => {
      if (adoptingRecordingRef.current !== artifact.id) return;
      // Only a completed adoption spends the one-shot editor intent. A refusal (still locked, no
      // longer a finished take) or a failure surfaces through the workflow's own error state and
      // leaves the request armed; the marker stays set so this cannot retry in a loop, and
      // asking for the editor again clears it.
      if (!adopted) {
        // The Create launcher must not stay busy for a launch that will never arrive.
        clearCreateLaunch();
        return;
      }
      adoptingRecordingRef.current = null;
      setRecordingForExistingVideo(false);
      // A Create launch is settled by the pre-arm effect below, once the workflow actually holds
      // the video: opening the editor first would mount its panel before the tool is set.
      if (request === null) openOverlay('video-upload');
    });
  }, [
    acquireOwnedMedia,
    clearCreateLaunch,
    existingVideo,
    openOverlay,
    recording.original,
    recordingForExistingVideo,
    stagePresentationKind,
  ]);

  /**
   * Arms a Create-task launch for a visual provider once the workflow holds the video.
   *
   * A successful arm is the one path that does not settle here: `addStep` schedules a render, and
   * the pass after it sees the configured step and opens the editor. Every other path clears the
   * request immediately, so a launch can neither loop nor strand a card. `addStep` is a local state
   * write — it contacts no provider.
   */
  // Named individually rather than depending on the workflow object, which is rebuilt every render:
  // this effect would otherwise re-enter on every pass through a component that renders often.
  const { addStep: addVisualStep, selection, steps } = existingVideo;
  useEffect(() => {
    const request = pendingCreateLaunchRef.current;
    if (request === null || !selection) return;
    // The on-device editor has nothing to arm and no overlay to open. The controller that owns it
    // dispatches it and ends the launch in the same act, so this effect must not end it on a
    // second, matching predicate — two owners of "spent" is how it came to be spent without ever
    // being dispatched.
    if (request === 'adjust') return;
    const modelId = VISUAL_MODEL_FOR_OPERATION[request];
    // An existing step is the one thing pre-arming must never touch: it may hold configured
    // settings, and discarding those is the editor's own confirmation to ask for. This is also
    // where a Project's saved visual treatment lands, because the creative adapter writes it into
    // the same slot as soon as the workflow holds the video.
    if (steps[0] !== undefined || !addVisualStep(modelId)) {
      clearCreateLaunch();
      openOverlay('video-upload');
    }
    // `launchedOperation` is in here for the request itself: the ref that carries it is not
    // reactive, so with a selection already in hand nothing else in this list changes when a launch
    // is armed, and the request would sit unspent with the card busy for good.
  }, [addVisualStep, clearCreateLaunch, launchedOperation, openOverlay, selection, steps]);

  /**
   * The ref has to be dropped on the way out, because it is the one half that cannot name its own
   * Project: the adoption and pre-arm effects above read it directly, and React runs every cleanup
   * before any body, so clearing it here is what stops them acting on the old Project's request.
   * The launch state needs no cleanup — it carries its Project and is read against the current one.
   */
  useEffect(
    () => () => {
      pendingCreateLaunchRef.current = null;
    },
    [activeProjectId],
  );

  const openExistingVideo = useCallback(() => {
    setRecordingForExistingVideo(false);
    openOverlay('video-upload');
  }, [openOverlay]);

  const startLocalRecording = useCallback(() => {
    if (!captureSupported) return;
    setRecordingForExistingVideo(false);
    closeOverlay();
    focusMain();
    void session.startLocal();
  }, [captureSupported, closeOverlay, focusMain, session]);

  const startExistingVideoRecording = useCallback(() => {
    if (!captureSupported) return;
    setRecordingForExistingVideo(true);
    closeOverlay();
    focusMain();
    void session.startLocal();
  }, [captureSupported, closeOverlay, focusMain, session]);

  /**
   * Starts a capture for a Project's source slot, dropping whatever the stage is holding.
   *
   * Stays a `() => void` for `onClick`; the awaiting half runs in an immediately-invoked function.
   * Its order is the load-bearing part: the take goes before the camera is asked for, so review
   * never owns a take while a fresh stream is being acquired for the same stage.
   */
  const startProjectRecording = useCallback(() => {
    const projectId = launchableProjectId({
      activeProjectId,
      projectSourceActivity,
      recordingActive,
      captureSupported,
    });
    if (projectId === null) return;
    void (async () => {
      // Asked before any side effect, so declining leaves the overlay, the route and the take
      // exactly as they were. Only owned bytes raise the question: a URL-backed presentation is a
      // Project source streamed from the server, durable there, and clearing it loses nothing.
      if (ownedRecordingArtifact(recording.presented) !== null) {
        if (!(await confirmation.ask(takeDiscardQuestion('project-recording')))) return;
        // The world moves under a modal the shell owns, so both facts come from the last commit
        // rather than from the closure that asked: is this runtime still here, and is this still
        // the Project it may launch in.
        if (!mountedRef.current) return;
        if (launchableProjectId(launchStateRef.current) !== projectId) return;
      }
      // A defensive assert, not a diagnosed failure: `recordingActive` is in the guard and a modal
      // held focus throughout, so a refusal here is unreachable. It is here so that a take can
      // never be left standing behind a stage that has already gone back to live capture — the
      // launch simply stops, and take review keeps its own controls and its own notice slot.
      if (!recording.discard()) return;
      setRecordingForExistingVideo(false);
      closeOverlay();
      void navigate(projectWorkspacePath(projectId));
      focusMain();
      void session.startLocal();
    })();
  }, [
    activeProjectId,
    captureSupported,
    closeOverlay,
    confirmation,
    focusMain,
    navigate,
    projectSourceActivity,
    recording,
    recordingActive,
    session,
  ]);

  const openPlaybackEditor = useCallback(
    (request?: ProjectCreateOperationId, origin: StudioEditorLaunchOrigin = 'create-card') => {
      if (!recording.presented || recordingActive) return;
      pendingCreateLaunchRef.current = request ?? null;
      setCreateLaunch(
        request === undefined ? null : { projectId: activeProjectId, operation: request, origin },
      );
      if (!existingVideo.selection) {
        // Asking again is the retry: clear the attempt marker so a previously refused or failed
        // adoption can run once more for the same take. This branch covers standalone takes and
        // Project cuts alike: the presented artifact is the video the operator is looking at, so
        // pressing Edit video adopts it rather than opening an empty chooser beside it.
        adoptingRecordingRef.current = null;
        setRecordingForExistingVideo(true);
        // A streamed Project source needs its complete bytes before adoption can validate it. The
        // acquisition shows its own progress and cancel; adoption resumes when it lands.
        // The adoption effect below owns re-acquiring the bytes, including this first pass.
        return;
      }
      // A selection is already in hand, so there is nothing to wait for — but a Create launch still
      // routes through the pre-arm effect, which runs on the next render and owns every exit.
      if (request !== undefined) return;
      openExistingVideo();
    },
    [
      activeProjectId,
      existingVideo.selection,
      openExistingVideo,
      recording.presented,
      recordingActive,
    ],
  );

  const handledRecordIntentRef = useRef<string | null>(null);
  useEffect(() => {
    if (location.pathname !== APP_PATHS.create || creationIntent !== 'record') return;
    // Keyed on location.key so the guard scopes to one history entry rather than to this mount:
    // returning to the same URL later is a new entry and records again, including when the return
    // stays inside Studio and nothing remounts. It also bounds the case where startLocalRecording
    // bails on an unsupported browser — that entry is spent, but the next one is not.
    const intentKey = `${location.key}:${location.pathname}${location.search}`;
    if (handledRecordIntentRef.current === intentKey) return;
    handledRecordIntentRef.current = intentKey;
    startLocalRecording();
  }, [creationIntent, location.key, location.pathname, location.search, startLocalRecording]);

  /** Cancels a pending "record for the post-recording editor" handoff without touching adoption. */
  const clearExistingVideoIntent = useCallback(() => {
    setRecordingForExistingVideo(false);
    clearCreateLaunch();
  }, [clearCreateLaunch]);

  /** Full reset of the handoff, including any take mid-adoption, for discard and cleanup paths. */
  const discardPendingAdoption = useCallback(() => {
    adoptingRecordingRef.current = null;
    setRecordingForExistingVideo(false);
    clearCreateLaunch();
  }, [clearCreateLaunch]);

  /**
   * Sends the stage from a reviewed take back to a live camera.
   *
   * The whole act in one owner, in the order that matters: the take goes first, then the handoff it
   * could have been adopted into, and only then is a stream asked for — so review never owns a take
   * while a fresh one is being acquired for the same stage. Answers whether it ran, so a surface
   * can say that a refused discard changed nothing. The camera comes back record-ready; nothing
   * here presses Record.
   *
   * `startLocalRecording` alone is not enough: it clears only the editor intent, while an armed
   * Create launch would outlive the take it pointed at. That is the pairing teardown already uses.
   */
  const restartCapture = useCallback((): boolean => {
    // Before the discard, not after: the surface already withholds the action on a browser that
    // cannot capture, and refusing here as well is what stops a take being destroyed for a camera
    // that `startLocalRecording` was going to decline to start.
    if (!captureSupported) return false;
    // A refusal means the take is still finalizing, so it is still there. The caller says so; the
    // handoff and the camera stay untouched.
    if (!recording.discard()) return false;
    discardPendingAdoption();
    startLocalRecording();
    return true;
  }, [captureSupported, discardPendingAdoption, recording, startLocalRecording]);

  return {
    captureSupported,
    startLocalRecording,
    startExistingVideoRecording,
    startProjectRecording,
    restartCapture,
    openPlaybackEditor,
    openExistingVideo,
    clearExistingVideoIntent,
    discardPendingAdoption,
    launchingOperation,
    launchedOperation,
    clearCreateLaunch,
  } as const;
};
