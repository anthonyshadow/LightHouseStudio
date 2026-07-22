import { useCallback, useEffect, useRef, useState } from 'react';
import type { StagePresentation } from '../features/live-stage';
import { hasSameRecordingTracks } from '../features/recording';
import { useRecording, useRecordingSource } from '../orchestration/recording';
import { type useStudioSession } from '../orchestration/session';
import { useVoiceProcessing } from '../orchestration/voice-processing';
import { shouldFinalizeForUnusableModelOutput } from './studioPolicies';

type StudioSessionController = ReturnType<typeof useStudioSession>;
type RecordingController = ReturnType<typeof useRecording>;

type TakeStagePresentationInput = {
  readonly reviewReady: boolean;
  readonly recording: Pick<RecordingController, 'lifecycle' | 'presented' | 'processingState'>;
  readonly finalizingStartedAt: number | null;
  readonly finalizingStream: MediaStream | null;
  readonly displayStream: MediaStream | null;
  readonly mode: StudioSessionController['draft']['mode'];
  readonly transformedVideoUsable: boolean;
};

export const deriveTakeStagePresentation = ({
  reviewReady,
  recording,
  finalizingStartedAt,
  finalizingStream,
  displayStream,
  mode,
  transformedVideoUsable,
}: TakeStagePresentationInput): StagePresentation => {
  if (reviewReady && recording.presented) {
    return {
      kind: 'playback',
      artifact: recording.presented,
      controlsLocked: recording.processingState === 'processing',
    };
  }
  if (recording.lifecycle === 'stopping' || finalizingStartedAt !== null) {
    return {
      kind: 'finalizing',
      retainedStream: finalizingStream ?? displayStream,
      startedAt: finalizingStartedAt ?? 0,
    };
  }
  if (displayStream) {
    const provider = mode !== 'local' && transformedVideoUsable;
    return {
      kind: 'live',
      stream: displayStream,
      origin: provider ? 'provider' : 'local',
      mirrored: !provider,
    };
  }
  return { kind: 'idle', mode };
};

type UseTakeReviewFlowOptions = {
  readonly session: StudioSessionController;
  readonly onReviewAvailable: () => void;
  readonly onReviewPublished: () => void;
  readonly onReviewCleared: () => void;
};

type TakeFinalizationCallbacks<T> = {
  readonly finalize: () => Promise<T | null>;
  readonly releaseLiveResources: () => Promise<void>;
  readonly enterReview: (artifact: T) => void;
  readonly handleEmpty: () => void;
};

/** Finalizes borrowed recorder data before releasing live owners and publishing review state. */
export const finalizeTakeForReview = async <T>({
  finalize,
  releaseLiveResources,
  enterReview,
  handleEmpty,
}: TakeFinalizationCallbacks<T>): Promise<void> => {
  let artifact: T | null = null;
  try {
    artifact = await finalize();
  } finally {
    await releaseLiveResources();
  }

  if (artifact) {
    enterReview(artifact);
  } else {
    handleEmpty();
  }
};

export const useTakeReviewFlow = ({
  session,
  onReviewAvailable,
  onReviewPublished,
  onReviewCleared,
}: UseTakeReviewFlowOptions) => {
  const [reviewReady, setReviewReady] = useState(false);
  const [finalizingStream, setFinalizingStream] = useState<MediaStream | null>(null);
  const [finalizingStartedAt, setFinalizingStartedAt] = useState<number | null>(null);
  const finishPromiseRef = useRef<Promise<void> | null>(null);

  const automaticDisplayStream = session.displayStream;
  const automaticReviewRelease = session.releaseForRecordedReview;
  const handleAutomaticRecordingStop = useCallback(() => {
    setFinalizingStream((current) => current ?? automaticDisplayStream);
    setFinalizingStartedAt((current) => current ?? Date.now());
    void automaticReviewRelease().then(() => {
      setFinalizingStream(null);
      setFinalizingStartedAt(null);
      setReviewReady(true);
      onReviewAvailable();
    });
  }, [automaticDisplayStream, automaticReviewRelease, onReviewAvailable]);

  const recording = useRecording({ onAutomaticStop: handleAutomaticRecordingStop });
  const processing = useVoiceProcessing(recording);
  const recordingActive = recording.lifecycle === 'recording' || recording.lifecycle === 'stopping';
  const reviewLocked = Boolean(recording.presented);
  const mediaLocked = recordingActive || reviewLocked;
  const recordingSource = useRecordingSource(
    session.draft.mode,
    session.localStream,
    session.transformedVideoUsable ? session.remoteStream : null,
  );

  useEffect(() => {
    if (recording.presented) return;
    onReviewCleared();
  }, [onReviewCleared, recording.presented]);

  const stopRecording = recording.stop;
  const releaseForRecordedReview = session.releaseForRecordedReview;
  const currentDisplayStream = session.displayStream;
  const finishTake = useCallback((): Promise<void> => {
    if (finishPromiseRef.current) return finishPromiseRef.current;

    setFinalizingStream(currentDisplayStream);
    setFinalizingStartedAt(Date.now());
    setReviewReady(false);

    const finishPromise = finalizeTakeForReview({
      finalize: stopRecording,
      releaseLiveResources: async () => {
        await releaseForRecordedReview();
        setFinalizingStream(null);
      },
      enterReview: () => {
        setFinalizingStartedAt(null);
        setFinalizingStream(null);
        setReviewReady(true);
        onReviewAvailable();
        onReviewPublished();
      },
      handleEmpty: () => {
        setReviewReady(false);
        setFinalizingStartedAt(null);
      },
    }).finally(() => {
      finishPromiseRef.current = null;
    });

    finishPromiseRef.current = finishPromise;
    return finishPromise;
  }, [
    currentDisplayStream,
    onReviewAvailable,
    onReviewPublished,
    releaseForRecordedReview,
    stopRecording,
  ]);

  useEffect(() => {
    if (
      !shouldFinalizeForUnusableModelOutput(
        recording.lifecycle,
        session.draft.mode,
        session.transformedVideoUsable,
      )
    ) {
      return;
    }
    void finishTake();
  }, [finishTake, recording.lifecycle, session.draft.mode, session.transformedVideoUsable]);

  useEffect(() => {
    if (
      recording.lifecycle === 'recording' &&
      !hasSameRecordingTracks(recording.activeSource, recordingSource)
    ) {
      void finishTake();
    }
  }, [finishTake, recording.activeSource, recording.lifecycle, recordingSource]);

  const stagePresentation = deriveTakeStagePresentation({
    reviewReady,
    recording,
    finalizingStartedAt,
    finalizingStream,
    displayStream: session.displayStream,
    mode: session.draft.mode,
    transformedVideoUsable: session.transformedVideoUsable,
  });

  return {
    recording,
    processing,
    recordingActive,
    reviewLocked,
    mediaLocked,
    recordingSource,
    finalizingStartedAt,
    finalizingStream,
    finishTake,
    stagePresentation,
  } as const;
};
