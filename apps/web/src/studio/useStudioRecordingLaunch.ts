import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { APP_PATHS, projectWorkspacePath, type StudioCreationIntent } from '../app/paths';
import type { BrowserCapabilities } from '../application/types';
import type { useExistingVideoWorkflow } from '../features/existing-video/useExistingVideoWorkflow';
import type { ProjectSourceActivity } from '../features/projects/useProjectSourceController';
import type { useStudioSession } from '../orchestration/session';
import type { useStudioOverlayController } from './useStudioOverlayController';
import type { useTakeReviewFlow } from './useTakeReviewFlow';

interface UseStudioRecordingLaunchOptions {
  readonly browser: BrowserCapabilities;
  readonly session: ReturnType<typeof useStudioSession>;
  readonly recording: ReturnType<typeof useTakeReviewFlow>['recording'];
  readonly recordingActive: boolean;
  readonly stagePresentationKind: ReturnType<typeof useTakeReviewFlow>['stagePresentation']['kind'];
  readonly existingVideo: ReturnType<typeof useExistingVideoWorkflow>;
  readonly creationIntent: StudioCreationIntent | null;
  readonly projectContextActive: boolean;
  readonly activeProjectId: string | null;
  readonly projectSourceActivity: ProjectSourceActivity | null;
  /** Resolves true once the presented original is owned bytes; false on cancel or failure. */
  readonly acquireOwnedMedia: () => Promise<boolean>;
  readonly openOverlay: ReturnType<typeof useStudioOverlayController>['open'];
  readonly closeOverlay: ReturnType<typeof useStudioOverlayController>['close'];
  readonly focusMain: () => void;
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
  projectContextActive,
  activeProjectId,
  projectSourceActivity,
  acquireOwnedMedia,
  openOverlay,
  closeOverlay,
  focusMain,
}: UseStudioRecordingLaunchOptions) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [recordingForExistingVideo, setRecordingForExistingVideo] = useState(false);
  const adoptingRecordingRef = useRef<string | null>(null);
  const captureSupported = Boolean(
    browser.mediaRecorder && browser.mediaDevices && browser.secureContext,
  );

  useEffect(() => {
    const artifact = recording.original;
    if (
      !recordingForExistingVideo ||
      !artifact ||
      // Adoption validates complete media, so a URL-backed presentation waits here until the
      // deferred acquisition republishes it as owned bytes.
      !(artifact.media instanceof Blob) ||
      existingVideo.selection ||
      stagePresentationKind !== 'playback' ||
      adoptingRecordingRef.current === artifact.id
    ) {
      return;
    }

    adoptingRecordingRef.current = artifact.id;
    void existingVideo.adoptRecordedArtifact().then(() => {
      if (adoptingRecordingRef.current !== artifact.id) return;
      adoptingRecordingRef.current = null;
      setRecordingForExistingVideo(false);
      openOverlay('video-upload');
    });
  }, [
    existingVideo,
    openOverlay,
    recording.original,
    recordingForExistingVideo,
    stagePresentationKind,
  ]);

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

  const startProjectRecording = useCallback(() => {
    if (
      activeProjectId === null ||
      projectSourceActivity?.accepted ||
      projectSourceActivity?.busy ||
      !captureSupported
    ) {
      return;
    }
    setRecordingForExistingVideo(false);
    closeOverlay();
    recording.discard();
    void navigate(projectWorkspacePath(activeProjectId));
    focusMain();
    void session.startLocal();
  }, [
    activeProjectId,
    captureSupported,
    closeOverlay,
    focusMain,
    navigate,
    projectSourceActivity,
    recording,
    session,
  ]);

  const openPlaybackEditor = useCallback(() => {
    if (!recording.presented || recordingActive) return;
    if (projectContextActive && !existingVideo.selection) {
      setRecordingForExistingVideo(true);
      // A streamed Project source needs its complete bytes before adoption can validate it. The
      // acquisition shows its own progress and cancel; adoption resumes when it lands.
      if (!(recording.presented.media instanceof Blob)) void acquireOwnedMedia();
      return;
    }
    openExistingVideo();
  }, [
    acquireOwnedMedia,
    existingVideo.selection,
    openExistingVideo,
    projectContextActive,
    recording.presented,
    recordingActive,
  ]);

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
  const clearExistingVideoIntent = useCallback(() => setRecordingForExistingVideo(false), []);

  /** Full reset of the handoff, including any take mid-adoption, for discard and cleanup paths. */
  const discardPendingAdoption = useCallback(() => {
    adoptingRecordingRef.current = null;
    setRecordingForExistingVideo(false);
  }, []);

  return {
    startLocalRecording,
    startExistingVideoRecording,
    startProjectRecording,
    openPlaybackEditor,
    openExistingVideo,
    clearExistingVideoIntent,
    discardPendingAdoption,
  } as const;
};
