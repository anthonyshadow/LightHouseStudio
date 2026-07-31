// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { useRecording as useRecordingHook } from '../orchestration/recording';
import type { AutomaticRecordingStopEvent } from '../features/recording';
import { createEmptyDraft } from '../features/media-session';

const useRecording = vi.hoisted(() => vi.fn());
const useRecordingSource = vi.hoisted(() => vi.fn());
const hasSameRecordingTracks = vi.hoisted(() => vi.fn(() => true));
const useVoiceProcessing = vi.hoisted(() => vi.fn(() => ({ state: 'idle' })));

vi.mock('../orchestration/recording', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, hasSameRecordingTracks, useRecording, useRecordingSource };
});
vi.mock('../orchestration/voice-processing', () => ({ useVoiceProcessing }));

import { useTakeReviewFlow } from './useTakeReviewFlow';

type FlowOptions = Parameters<typeof useTakeReviewFlow>[0];
type RecordingController = ReturnType<typeof useRecordingHook>;

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((onResolve) => {
    resolve = onResolve;
  });
  return { promise, resolve };
};

const createRecording = (
  stop: RecordingController['stop'],
): Pick<
  RecordingController,
  'activeSource' | 'lifecycle' | 'presented' | 'processingState' | 'stop'
> => ({
  activeSource: null,
  lifecycle: 'recording',
  presented: null,
  processingState: 'idle',
  stop,
});

const createSession = (
  releaseForRecordedReview: FlowOptions['session']['releaseForRecordedReview'],
  displayStream: MediaStream,
  overrides: Partial<FlowOptions['session']> = {},
): FlowOptions['session'] =>
  ({
    displayStream,
    draft: createEmptyDraft('local'),
    localStream: displayStream,
    realtimeSessionTiming: null,
    completeExpectedModelSession: vi.fn().mockResolvedValue(undefined),
    releaseForRecordedReview,
    remoteStream: null,
    transformedVideoUsable: false,
    ...overrides,
  }) as FlowOptions['session'];

beforeEach(() => {
  useRecording.mockReset();
  useRecordingSource.mockReset();
  useRecordingSource.mockReturnValue(null);
  hasSameRecordingTracks.mockClear();
  useVoiceProcessing.mockClear();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('useTakeReviewFlow finalization ownership', () => {
  it('coalesces duplicate finish requests and releases live owners only after settlement', async () => {
    const artifact = { id: 'take-1' } as NonNullable<RecordingController['presented']>;
    const finalization = deferred<RecordingController['presented']>();
    const events: string[] = [];
    const stop = vi.fn(() => {
      events.push('stop');
      return finalization.promise;
    }) as RecordingController['stop'];
    const recording = createRecording(stop);
    useRecording.mockReturnValue(recording);
    const displayStream = {} as MediaStream;
    const releaseForRecordedReview = vi.fn(() => {
      events.push('release');
      return Promise.resolve();
    });
    const onReviewCleared = vi.fn();
    const { result, rerender } = renderHook(() =>
      useTakeReviewFlow({
        session: createSession(releaseForRecordedReview, displayStream),
        onReviewCleared,
      }),
    );

    let first!: Promise<void>;
    let second!: Promise<void>;
    act(() => {
      first = result.current.finishTake();
      second = result.current.finishTake();
    });

    expect(first).toBe(second);
    expect(stop).toHaveBeenCalledOnce();
    expect(releaseForRecordedReview).not.toHaveBeenCalled();
    expect(result.current.stagePresentation).toMatchObject({
      kind: 'finalizing',
      retainedStream: displayStream,
    });

    await act(async () => {
      finalization.resolve(artifact);
      await first;
    });
    recording.lifecycle = 'recorded';
    recording.presented = artifact;
    rerender();

    expect(events).toEqual(['stop', 'release']);
    expect(releaseForRecordedReview).toHaveBeenCalledOnce();
    expect(result.current.stagePresentation).toMatchObject({
      kind: 'playback',
      artifact,
    });
  });

  it('retains the stream until automatic cleanup settles', async () => {
    const artifact = { id: 'take-automatic' } as NonNullable<RecordingController['presented']>;
    const release = deferred<void>();
    const recording = createRecording(vi.fn());
    useRecording.mockImplementation(
      (options: { onAutomaticStop: (event: AutomaticRecordingStopEvent) => void }) => {
        capturedAutomaticStop = options.onAutomaticStop;
        return recording;
      },
    );
    const displayStream = {} as MediaStream;
    const releaseForRecordedReview = vi.fn(() => release.promise);
    const { result, rerender } = renderHook(() =>
      useTakeReviewFlow({
        session: createSession(releaseForRecordedReview, displayStream),
        onReviewCleared: vi.fn(),
      }),
    );

    act(() =>
      capturedAutomaticStop({
        mode: 'local',
        reason: 'maximum-duration',
        artifactId: 'take-automatic',
      }),
    );
    expect(result.current.stagePresentation).toMatchObject({
      kind: 'finalizing',
      retainedStream: displayStream,
    });
    expect(releaseForRecordedReview).toHaveBeenCalledOnce();

    recording.lifecycle = 'recorded';
    recording.presented = artifact;
    rerender();
    expect(result.current.recording.presented).toBe(artifact);
    expect(result.current.automaticRecordingStopEvent).toEqual({
      mode: 'local',
      reason: 'maximum-duration',
      artifactId: 'take-automatic',
    });
    await act(async () => {
      release.resolve();
      await release.promise;
    });

    expect(result.current.recording.presented).toBe(artifact);
    expect(result.current.finalizingStartedAt).toBeNull();
    expect(result.current.finalizingStream).toBeNull();
  });

  it('finalizes an active take before releasing an AI session that reaches its limit', async () => {
    const artifact = { id: 'take-at-ai-limit' } as NonNullable<RecordingController['presented']>;
    const finalization = deferred<RecordingController['presented']>();
    const events: string[] = [];
    const stop = vi.fn(() => {
      events.push('recorder-stop');
      return finalization.promise;
    }) as RecordingController['stop'];
    const recording = createRecording(stop);
    useRecording.mockReturnValue(recording);
    const releaseForRecordedReview = vi.fn(() => {
      events.push('live-release');
      return Promise.resolve();
    });
    const session = createSession(releaseForRecordedReview, {} as MediaStream, {
      draft: { ...createEmptyDraft('lucy-latest'), prompt: 'Business host' },
      realtimeSessionTiming: {
        status: 'limit-reached',
        maximumSeconds: 300,
        elapsedSeconds: 300,
        remainingSeconds: 0,
        warning: false,
      },
    });

    const { rerender } = renderHook(() =>
      useTakeReviewFlow({
        session,
        onReviewCleared: vi.fn(),
      }),
    );

    expect(stop).toHaveBeenCalledOnce();
    expect(releaseForRecordedReview).not.toHaveBeenCalled();

    act(() => {
      recording.lifecycle = 'recorded';
      recording.presented = artifact;
      session.realtimeSessionTiming = null;
      finalization.resolve(artifact);
      rerender();
    });
    await waitFor(() => expect(releaseForRecordedReview).toHaveBeenCalledOnce());

    expect(events).toEqual(['recorder-stop', 'live-release']);
    expect(releaseForRecordedReview).toHaveBeenCalledOnce();
    expect(session.completeExpectedModelSession).not.toHaveBeenCalled();
  });
});

let capturedAutomaticStop: (event: AutomaticRecordingStopEvent) => void = () => {
  throw new Error('Automatic stop callback was not installed.');
};
