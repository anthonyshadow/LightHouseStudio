import { useMemo } from 'react';
import type { RecordingController } from '../recording';
import type { StageNotice, StagePresentation } from '../live-stage';
import type { StudioSessionController } from '../media-session';
import type { GuidedFlowStatus } from '../guided-flow';

type GuidedStageRecording = Pick<
  RecordingController,
  'presented' | 'processingState' | 'recordingError'
>;

type GuidedStageSession = Pick<
  StudioSessionController,
  'displayStream' | 'transformedVideoUsable' | 'error' | 'clearError'
>;

export const useGuidedStageMedia = (
  status: GuidedFlowStatus,
  recording: GuidedStageRecording,
  session: GuidedStageSession,
): Readonly<{
  presentation: StagePresentation;
  notices: readonly StageNotice[];
}> => {
  const presentation = useMemo<StagePresentation>(() => {
    if (
      recording.presented &&
      (status === 'record.review' || status.startsWith('voice.') || status.startsWith('download.'))
    ) {
      return {
        kind: 'playback',
        artifact: recording.presented,
        controlsLocked: recording.processingState === 'processing',
      };
    }
    if (status === 'record.finalizing') {
      return {
        kind: 'finalizing',
        retainedStream: session.displayStream,
        // Preserve the existing transition-time timestamp used by MediaStage.
        // eslint-disable-next-line react-hooks/purity
        startedAt: Date.now(),
      };
    }
    if (session.displayStream) {
      const provider = session.transformedVideoUsable;
      return {
        kind: 'live',
        stream: session.displayStream,
        origin: provider ? 'provider' : 'local',
        mirrored: !provider,
      };
    }
    return { kind: 'idle', mode: 'lucy-2.5' };
  }, [
    status,
    recording.presented,
    recording.processingState,
    session.displayStream,
    session.transformedVideoUsable,
  ]);

  const notices = useMemo<readonly StageNotice[]>(() => {
    const nextNotices: StageNotice[] = [];
    if (session.error) {
      nextNotices.push({
        id: `guided-session-${session.error.code}`,
        severity: 'error',
        title: session.error.message,
        message: session.error.recovery ?? 'Try the action again when the issue is resolved.',
        action: { label: 'Dismiss', onAction: session.clearError },
      });
    }
    if (recording.recordingError) {
      nextNotices.push({
        id: 'guided-recording-error',
        severity: 'error',
        title: 'Recording needs attention',
        message: recording.recordingError,
      });
    }
    return nextNotices;
  }, [recording.recordingError, session.clearError, session.error]);

  return { presentation, notices };
};
