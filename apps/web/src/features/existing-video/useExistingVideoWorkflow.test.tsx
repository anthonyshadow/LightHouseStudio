// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RecordingArtifact, RecordingController } from '../recording/types';

const adapters = vi.hoisted(() => ({
  validateExistingVideo: vi.fn(),
  submitVideoJob: vi.fn(),
  fetchVideoJob: vi.fn(),
  downloadVideoJobResult: vi.fn(),
  releaseVideoJob: vi.fn(),
  replaceRecordingAudio: vi.fn(),
  stripRecordingAudio: vi.fn(),
}));

vi.mock('./videoValidation', () => ({
  validateExistingVideo: adapters.validateExistingVideo,
}));
vi.mock('../../adapters/api-client/videoJobsApi', () => ({
  submitVideoJob: adapters.submitVideoJob,
  fetchVideoJob: adapters.fetchVideoJob,
  downloadVideoJobResult: adapters.downloadVideoJobResult,
  releaseVideoJob: adapters.releaseVideoJob,
}));
vi.mock('../../adapters/media-processing/replaceAudioTrack', () => ({
  replaceRecordingAudio: adapters.replaceRecordingAudio,
  stripRecordingAudio: adapters.stripRecordingAudio,
}));

import { useExistingVideoWorkflow } from './useExistingVideoWorkflow';

const artifact = (id: string, media: Blob): RecordingArtifact => ({
  id,
  media,
  objectUrl: `blob:${id}`,
  mimeType: media.type,
  filename: `${id}.mp4`,
  sourceModeId: 'local',
  startedAt: '2026-07-30T12:00:00.000Z',
  durationMs: 1_000,
  sizeBytes: media.size,
});

const recordingController = (): RecordingController => {
  const source = artifact('source', new Blob(['source'], { type: 'video/mp4' }));
  const recording: RecordingController = {
    lifecycle: 'recorded',
    activeSource: null,
    metadata: null,
    original: source,
    visual: null,
    processed: null,
    presented: source,
    sidecar: { state: 'unavailable', blob: null, mimeType: null, error: null },
    recordingError: null,
    processingState: 'idle',
    processingError: null,
    elapsedSeconds: 1,
    downloaded: false,
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(source),
    restorePersistedOriginal: vi.fn().mockReturnValue(source),
    discard: vi.fn(),
    markDownloaded: vi.fn(),
    beginProcessing: vi.fn(),
    cancelProcessing: vi.fn(),
    completeVisualProcessing: vi.fn((blob: Blob, mimeType: string, label: string) => {
      const visual = artifact(`visual-${label}`, new Blob([blob], { type: mimeType }));
      recording.visual = visual;
      recording.presented = visual;
      return visual;
    }),
    completeProcessing: vi.fn().mockReturnValue(source),
    failProcessing: vi.fn(),
    restoreOriginal: vi.fn(),
  };
  return recording;
};

const inspected = (file: File) => ({
  file,
  mimeType: 'video/mp4' as const,
  audioSidecar: null,
  audioUnavailableReason: null,
  metadata: {
    kind: 'uploaded' as const,
    mode: 'local' as const,
    selectedAt: '2026-07-30T12:00:00.000Z',
    displayName: file.name,
    container: 'mp4' as const,
    videoCodec: 'avc' as const,
    audioCodec: null,
    durationMs: 1_000,
    width: 1_280,
    height: 720,
    sizeBytes: file.size,
    hasAudio: false,
  },
});

const jobStatus = (jobId: string) => ({
  jobId,
  modelId: 'lucy-2.5' as const,
  status: 'ready' as const,
  createdAt: '2026-07-30T12:00:00.000Z',
  updatedAt: '2026-07-30T12:00:01.000Z',
  expiresAt: '2026-07-30T13:00:00.000Z',
  result: {
    mimeType: 'video/mp4' as const,
    container: 'mp4' as const,
    videoCodec: 'avc' as const,
    audioCodec: null,
    durationMs: 1_000,
    width: 1_280,
    height: 720,
    sizeBytes: 10,
    hasAudio: false,
  },
  error: null,
});

beforeEach(() => {
  vi.clearAllMocks();
  const resultBlob = new Blob(['result'], { type: 'video/mp4' });
  adapters.submitVideoJob.mockImplementation((jobId: string) =>
    Promise.resolve({ ...jobStatus(jobId), status: 'queued' }),
  );
  adapters.fetchVideoJob.mockImplementation((jobId: string) => Promise.resolve(jobStatus(jobId)));
  adapters.downloadVideoJobResult.mockResolvedValue(resultBlob);
  adapters.releaseVideoJob.mockResolvedValue(undefined);
  adapters.stripRecordingAudio.mockResolvedValue({
    blob: resultBlob,
    mimeType: 'video/mp4',
  });
});

describe('useExistingVideoWorkflow', () => {
  it('pauses after the first ordered step and never submits the second without Continue', async () => {
    const sourceFile = new File(['source'], 'source.mp4', { type: 'video/mp4' });
    adapters.validateExistingVideo.mockResolvedValue(inspected(sourceFile));
    const recording = recordingController();
    const publishUploadedVideo = vi.fn();
    const onSubmissionAccepted = vi.fn();
    const { result, unmount } = renderHook(() =>
      useExistingVideoWorkflow({
        recording,
        publishUploadedVideo,
        onSubmissionAccepted,
      }),
    );

    await act(async () => result.current.selectFile(sourceFile));
    act(() => {
      result.current.addStep('lucy-2.5');
      result.current.addStep('lucy-vton-3');
    });
    act(() => {
      for (const step of result.current.steps) {
        result.current.updateStep(step.id, { prompt: `Prompt for ${step.modelId}` });
      }
    });

    await act(async () => result.current.submitStep(0));
    await waitFor(() => expect(result.current.phase).toBe('checkpoint'));

    expect(adapters.submitVideoJob).toHaveBeenCalledTimes(1);
    expect(recording.completeVisualProcessing).toHaveBeenCalledTimes(1);
    expect(onSubmissionAccepted).toHaveBeenCalledTimes(1);
    expect(result.current.completedStepCount).toBe(1);
    expect(result.current.message).toContain('1 additional Decart submission');

    await act(async () => result.current.submitStep(1));
    await waitFor(() => expect(result.current.phase).toBe('complete'));

    expect(adapters.submitVideoJob).toHaveBeenCalledTimes(2);
    expect(recording.completeVisualProcessing).toHaveBeenCalledTimes(2);
    unmount();
  });
});
