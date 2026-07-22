import { describe, expect, it } from 'vitest';
import type { useRecording } from '../orchestration/recording';
import { deriveTakeStagePresentation, finalizeTakeForReview } from './useTakeReviewFlow';

type RecordingController = ReturnType<typeof useRecording>;

const recordingState = (
  overrides: Partial<Pick<RecordingController, 'lifecycle' | 'presented' | 'processingState'>> = {},
): Pick<RecordingController, 'lifecycle' | 'presented' | 'processingState'> => ({
  lifecycle: 'idle',
  presented: null,
  processingState: 'idle',
  ...overrides,
});

describe('deriveTakeStagePresentation', () => {
  it('keeps the idle and live stage modes truthful', () => {
    expect(
      deriveTakeStagePresentation({
        reviewReady: false,
        recording: recordingState(),
        finalizingStartedAt: null,
        finalizingStream: null,
        displayStream: null,
        mode: 'lucy-2.5',
        transformedVideoUsable: false,
      }),
    ).toEqual({ kind: 'idle', mode: 'lucy-2.5' });

    const localStream = {} as MediaStream;
    expect(
      deriveTakeStagePresentation({
        reviewReady: false,
        recording: recordingState(),
        finalizingStartedAt: null,
        finalizingStream: null,
        displayStream: localStream,
        mode: 'local',
        transformedVideoUsable: false,
      }),
    ).toMatchObject({ kind: 'live', stream: localStream, origin: 'local', mirrored: true });

    const providerStream = {} as MediaStream;
    expect(
      deriveTakeStagePresentation({
        reviewReady: false,
        recording: recordingState(),
        finalizingStartedAt: null,
        finalizingStream: null,
        displayStream: providerStream,
        mode: 'lucy-2.5',
        transformedVideoUsable: true,
      }),
    ).toMatchObject({
      kind: 'live',
      stream: providerStream,
      origin: 'provider',
      mirrored: false,
    });
  });

  it('retains the finalizing stream until playback becomes authoritative', () => {
    const retainedStream = {} as MediaStream;
    expect(
      deriveTakeStagePresentation({
        reviewReady: false,
        recording: recordingState({ lifecycle: 'stopping' }),
        finalizingStartedAt: 42,
        finalizingStream: retainedStream,
        displayStream: null,
        mode: 'local',
        transformedVideoUsable: false,
      }),
    ).toEqual({ kind: 'finalizing', retainedStream, startedAt: 42 });

    const artifact = {} as NonNullable<RecordingController['presented']>;
    expect(
      deriveTakeStagePresentation({
        reviewReady: true,
        recording: recordingState({
          lifecycle: 'recorded',
          presented: artifact,
          processingState: 'processing',
        }),
        finalizingStartedAt: 42,
        finalizingStream: retainedStream,
        displayStream: null,
        mode: 'local',
        transformedVideoUsable: false,
      }),
    ).toEqual({ kind: 'playback', artifact, controlsLocked: true });
  });
});

describe('finalizeTakeForReview', () => {
  it('finalizes the artifact before releasing live resources and entering review', async () => {
    const events: string[] = [];

    await finalizeTakeForReview({
      finalize: () => {
        events.push('finalize-recording');
        return Promise.resolve({ id: 'take-1' });
      },
      releaseLiveResources: () => {
        events.push('release-live-resources');
        return Promise.resolve();
      },
      enterReview: () => events.push('enter-recorded-review'),
      handleEmpty: () => events.push('empty'),
    });

    expect(events).toEqual([
      'finalize-recording',
      'release-live-resources',
      'enter-recorded-review',
    ]);
  });
});
