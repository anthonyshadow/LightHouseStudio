// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError } from '../../adapters/api-client/apiClient';
import type { RecordingArtifact, RecordingController } from '../recording/types';
import type { VoiceProcessingController } from '../voice-effects/types';

const adapters = vi.hoisted(() => ({
  validateExistingVideo: vi.fn(),
  submitVideoJob: vi.fn(),
  fetchVideoJob: vi.fn(),
  downloadVideoJobResult: vi.fn(),
  releaseVideoJob: vi.fn(),
  replaceRecordingAudio: vi.fn(),
  stripRecordingAudio: vi.fn(),
  transcodeRecordingToMp4: vi.fn(),
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
vi.mock('../../adapters/media-processing/transcodeRecording', () => ({
  transcodeRecordingToMp4: adapters.transcodeRecordingToMp4,
}));

import { savedCharacterStepInput, useExistingVideoWorkflow } from './useExistingVideoWorkflow';

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
    processingOperation: null,
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
    repairPresentedObjectUrl: vi.fn().mockReturnValue(false),
    clearVisualProcessing: vi.fn(() => {
      recording.visual = null;
      recording.processed = null;
      recording.presented = recording.original;
    }),
    restoreOriginal: vi.fn(),
  };
  return recording;
};

const processingController = (): VoiceProcessingController => ({
  selection: { kind: 'none' },
  applyLocal: vi.fn().mockResolvedValue(undefined),
  applyLocalTo: vi.fn().mockResolvedValue({ status: 'canceled' }),
  applyElevenLabs: vi.fn().mockResolvedValue(undefined),
  applyElevenLabsTo: vi.fn().mockResolvedValue({ status: 'canceled' }),
  restoreOriginal: vi.fn(),
  cancel: vi.fn(),
});

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
  operation: 'character-swap' as const,
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
  adapters.transcodeRecordingToMp4.mockImplementation((blob: Blob) =>
    Promise.resolve({ blob, mimeType: 'video/mp4' }),
  );
});

const configuredVisualWorkflow = async () => {
  const sourceFile = new File(['source'], 'source.mp4', { type: 'video/mp4' });
  adapters.validateExistingVideo.mockResolvedValue(inspected(sourceFile));
  const recording = recordingController();
  const hook = renderHook(() =>
    useExistingVideoWorkflow({
      recording,
      processing: processingController(),
      publishUploadedVideo: vi.fn(),
    }),
  );

  await act(async () => hook.result.current.selectFile(sourceFile));
  act(() => {
    hook.result.current.addStep('lucy-latest');
  });
  act(() =>
    hook.result.current.updateStep(hook.result.current.steps[0]!.id, {
      prompt: 'Change the lighting',
    }),
  );

  return { ...hook, recording, sourceFile };
};

describe('useExistingVideoWorkflow', () => {
  it('uses a saved character reference without its stored prompt', () => {
    const reference = new File(['portrait'], 'portrait.png', { type: 'image/png' });

    expect(savedCharacterStepInput('Stored character prompt', reference)).toEqual({
      prompt: '',
      referenceImage: reference,
    });
    expect(savedCharacterStepInput('Prompt-only character', null)).toEqual({
      prompt: 'Prompt-only character',
      referenceImage: null,
    });
  });

  it('requires a reference and locally prepares MOV as an ephemeral MP4 only when requested', async () => {
    const sourceFile = new File(['mov-source'], 'source.mov', { type: 'video/quicktime' });
    const preparedFile = new File(['prepared-mp4'], 'character-swap-source.mp4', {
      type: 'video/mp4',
    });
    const resultFile = new File(['result'], 'result.mp4', { type: 'video/mp4' });
    const movInspection = {
      ...inspected(sourceFile),
      mimeType: 'video/quicktime' as const,
      metadata: {
        ...inspected(sourceFile).metadata,
        container: 'quicktime' as const,
        displayName: sourceFile.name,
      },
    };
    adapters.validateExistingVideo
      .mockResolvedValueOnce(movInspection)
      .mockResolvedValueOnce(inspected(preparedFile))
      .mockResolvedValueOnce(inspected(resultFile));
    adapters.transcodeRecordingToMp4.mockResolvedValueOnce({
      blob: preparedFile,
      mimeType: 'video/mp4',
    });
    const recording = recordingController();
    const sourceArtifact = artifact('immutable-mov-source', sourceFile);
    const publishUploadedVideo = vi.fn().mockReturnValue(sourceArtifact);
    const { result } = renderHook(() =>
      useExistingVideoWorkflow({
        recording,
        processing: processingController(),
        publishUploadedVideo,
        videoProcessingCapabilities: {
          characterSwap: {
            available: true,
            inputPreparation: 'h264-mp4',
            referencePolicy: 'required',
            promptEnhancement: false,
            terminalFailureRelease: 'explicit-user',
          },
          virtualTryOn: {
            available: true,
            inputPreparation: 'none',
            referencePolicy: 'optional',
            promptEnhancement: true,
            terminalFailureRelease: 'automatic',
          },
        },
      }),
    );

    await act(async () => result.current.selectFile(sourceFile));
    act(() => {
      result.current.addStep('lucy-latest');
    });
    const reference = new File(['identity'], 'identity.png', { type: 'image/png' });
    act(() => {
      result.current.updateStep(result.current.steps[0]!.id, { referenceImage: reference });
    });
    await act(async () => result.current.submitStep(0));

    expect(adapters.transcodeRecordingToMp4).toHaveBeenCalledWith(
      sourceFile,
      expect.objectContaining({ requireAudio: false }),
    );
    expect(adapters.submitVideoJob.mock.calls[0]?.[2]).toBe(preparedFile);
    expect(adapters.submitVideoJob.mock.calls[0]?.[1]).toMatchObject({
      operation: 'character-swap',
      enhancePrompt: false,
      hasReferenceImage: true,
    });
    expect(sourceArtifact.media).toBe(sourceFile);
    expect(recording.original?.media).not.toBe(preparedFile);
  });

  it('blocks prompt-only Character Swap generically when the active capability requires a reference', async () => {
    const sourceFile = new File(['source'], 'source.mp4', { type: 'video/mp4' });
    adapters.validateExistingVideo.mockResolvedValue(inspected(sourceFile));
    const recording = recordingController();
    const { result } = renderHook(() =>
      useExistingVideoWorkflow({
        recording,
        processing: processingController(),
        publishUploadedVideo: vi.fn(),
        videoProcessingCapabilities: {
          characterSwap: {
            available: true,
            inputPreparation: 'h264-mp4',
            referencePolicy: 'required',
            promptEnhancement: false,
            terminalFailureRelease: 'explicit-user',
          },
          virtualTryOn: {
            available: true,
            inputPreparation: 'none',
            referencePolicy: 'optional',
            promptEnhancement: true,
            terminalFailureRelease: 'automatic',
          },
        },
      }),
    );

    await act(async () => result.current.selectFile(sourceFile));
    act(() => {
      result.current.addStep('lucy-latest');
    });
    act(() => {
      result.current.updateStep(result.current.steps[0]!.id, {
        prompt: 'Use the saved character direction',
      });
    });
    await act(async () => result.current.submitStep(0));

    expect(result.current.message).toBe(
      'Character Swap requires a reference image in this configuration.',
    );
    expect(adapters.submitVideoJob).not.toHaveBeenCalled();
  });

  it('never reports source-upload guidance when downloaded result validation fails', async () => {
    const { result, recording, unmount } = await configuredVisualWorkflow();
    adapters.validateExistingVideo.mockRejectedValueOnce(
      new Error('Use a 16:9 landscape or 9:16 portrait video.'),
    );

    await act(async () => result.current.submitStep(0));

    expect(result.current.phase).toBe('error');
    expect(result.current.message).toBe(
      'The downloaded visual result did not meet the app-owned media requirements.',
    );
    expect(result.current.message).not.toContain('Use a 16:9 landscape or 9:16 portrait video.');
    expect(adapters.validateExistingVideo).toHaveBeenLastCalledWith(
      expect.any(File),
      false,
      expect.any(AbortSignal),
      'server-approved-result',
    );
    expect(adapters.submitVideoJob).toHaveBeenCalledOnce();
    expect(adapters.releaseVideoJob).not.toHaveBeenCalled();
    expect(recording.completeVisualProcessing).not.toHaveBeenCalled();
    unmount();
  });

  it('keeps visual choices mutually exclusive and permits repeated explicit submissions', async () => {
    const sourceFile = new File(['source'], 'source.mp4', { type: 'video/mp4' });
    adapters.validateExistingVideo.mockResolvedValue(inspected(sourceFile));
    const recording = recordingController();
    const publishUploadedVideo = vi.fn();
    const onSubmissionAccepted = vi.fn();
    const { result, unmount } = renderHook(() =>
      useExistingVideoWorkflow({
        recording,
        processing: processingController(),
        publishUploadedVideo,
        onSubmissionAccepted,
      }),
    );

    await act(async () => result.current.selectFile(sourceFile));
    act(() => {
      result.current.addStep('lucy-latest');
    });
    expect(result.current.steps.map(({ modelId }) => modelId)).toEqual(['lucy-latest']);
    act(() => {
      result.current.addStep('lucy-vton-latest');
    });
    expect(result.current.steps.map(({ modelId }) => modelId)).toEqual(['lucy-vton-latest']);
    act(() => {
      result.current.addStep('lucy-latest');
    });
    expect(result.current.steps.map(({ modelId }) => modelId)).toEqual(['lucy-latest']);
    act(() =>
      result.current.updateStep(result.current.steps[0]!.id, {
        prompt: 'Prompt for lucy-latest',
      }),
    );

    await act(async () => result.current.submitStep(0));
    await waitFor(() => expect(result.current.phase).toBe('complete'));

    expect(adapters.submitVideoJob).toHaveBeenCalledTimes(1);
    expect(adapters.stripRecordingAudio).not.toHaveBeenCalled();
    expect(adapters.transcodeRecordingToMp4).not.toHaveBeenCalled();
    expect(recording.completeVisualProcessing).toHaveBeenCalledTimes(1);
    expect(onSubmissionAccepted).toHaveBeenCalledTimes(1);
    expect(result.current.completedStepCount).toBe(1);
    expect(adapters.submitVideoJob.mock.calls[0]![1]).toMatchObject({
      operation: 'character-swap',
    });

    expect(result.current.result?.objectUrl).toContain('blob:visual-character-swap');
    act(() => result.current.downloadResult());
    expect(recording.markDownloaded).toHaveBeenCalledOnce();

    act(() => result.current.startOver());
    expect(recording.clearVisualProcessing).toHaveBeenCalledOnce();
    expect(result.current.phase).toBe('ready');
    expect(result.current.selection?.file).toBe(sourceFile);
    expect(result.current.steps).toEqual([]);
    expect(result.current.result).toBeNull();
    expect(result.current.comparison).toBe('original');
    expect(result.current.completedStepCount).toBe(0);

    act(() => {
      result.current.addStep('lucy-vton-latest');
    });
    act(() =>
      result.current.updateStep(result.current.steps[0]!.id, {
        prompt: 'Second submission from the retained original',
      }),
    );
    await act(async () => result.current.submitStep(0));
    await waitFor(() => expect(result.current.phase).toBe('complete'));

    expect(adapters.submitVideoJob).toHaveBeenCalledTimes(2);
    expect(adapters.submitVideoJob.mock.calls[1]![1]).toMatchObject({
      operation: 'virtual-try-on',
      prompt: 'Second submission from the retained original',
    });

    for (let submissionNumber = 3; submissionNumber <= 5; submissionNumber += 1) {
      act(() => result.current.startOver());
      act(() => {
        result.current.addStep('lucy-latest');
      });
      act(() =>
        result.current.updateStep(result.current.steps[0]!.id, {
          prompt: `Explicit submission ${submissionNumber}`,
        }),
      );
      await act(async () => result.current.submitStep(0));
      await waitFor(() => expect(result.current.phase).toBe('complete'));
    }

    expect(adapters.submitVideoJob).toHaveBeenCalledTimes(5);
    expect(onSubmissionAccepted).toHaveBeenCalledTimes(5);
    expect(result.current.message).not.toContain('submission limit');
    unmount();
  });

  it('runs a captured visual plan before the selected voice conversion', async () => {
    const events: string[] = [];
    const sourceFile = new File(['source'], 'source.mp4', { type: 'video/mp4' });
    adapters.validateExistingVideo.mockResolvedValue(inspected(sourceFile));
    const recording = recordingController();
    const originalComplete = recording.completeVisualProcessing;
    recording.completeVisualProcessing = vi.fn(
      (blob: Blob, mimeType: string, label: string, source?: RecordingArtifact) => {
        events.push('visual-commit');
        return originalComplete(blob, mimeType, label, source);
      },
    );
    const processing = processingController();
    processing.applyElevenLabsTo = vi.fn(
      (video: RecordingArtifact, _voiceId: string, _voiceName: string) => {
        events.push(`voice:${video.id}`);
        return Promise.resolve({ status: 'ready' as const, artifact: video });
      },
    );
    const { result, unmount } = renderHook(() =>
      useExistingVideoWorkflow({
        recording,
        processing,
        publishUploadedVideo: vi.fn().mockReturnValue(recording.original),
      }),
    );

    await act(async () => result.current.selectFile(sourceFile));
    act(() => {
      result.current.addStep('lucy-latest');
      result.current.selectVoice('voice-northstar', 'Northstar Narrator');
    });
    act(() =>
      result.current.updateStep(result.current.steps[0]!.id, {
        prompt: 'Swap the character',
      }),
    );
    await act(async () => result.current.submitPlan());

    expect(events).toEqual([
      'visual-commit',
      expect.stringMatching(/^voice:visual-character-swap/u),
    ]);
    const voiceCall = vi.mocked(processing.applyElevenLabsTo).mock.calls[0];
    expect(voiceCall?.[0].id).toMatch(/^visual-character-swap/u);
    expect(voiceCall?.slice(1)).toEqual([
      'voice-northstar',
      'Northstar Narrator',
      { replaceExistingResult: true },
    ]);
    unmount();
  });

  it('retries Voice against the completed visual without resubmitting Decart', async () => {
    const sourceFile = new File(['source'], 'source.mp4', { type: 'video/mp4' });
    adapters.validateExistingVideo.mockResolvedValue(inspected(sourceFile));
    const recording = recordingController();
    const processing = processingController();
    processing.applyElevenLabsTo = vi
      .fn()
      .mockResolvedValueOnce({ status: 'error', message: 'Voice conversion was interrupted.' })
      .mockImplementationOnce((video: RecordingArtifact) =>
        Promise.resolve({ status: 'ready' as const, artifact: video }),
      );
    const { result, unmount } = renderHook(() =>
      useExistingVideoWorkflow({
        recording,
        processing,
        publishUploadedVideo: vi.fn().mockReturnValue(recording.original),
      }),
    );

    await act(async () => result.current.selectFile(sourceFile));
    act(() => {
      result.current.addStep('lucy-latest');
      result.current.selectVoice('voice-northstar', 'Northstar Narrator');
    });
    act(() =>
      result.current.updateStep(result.current.steps[0]!.id, {
        prompt: 'Swap the character',
      }),
    );

    await act(async () => result.current.submitPlan());
    expect(result.current.phase).toBe('error');
    expect(result.current.completedStepCount).toBe(1);
    const visual = recording.visual;
    expect(visual).not.toBeNull();

    await act(async () => result.current.submitPlan());

    expect(adapters.submitVideoJob).toHaveBeenCalledTimes(1);
    expect(processing.applyElevenLabsTo).toHaveBeenCalledTimes(2);
    expect(vi.mocked(processing.applyElevenLabsTo).mock.calls[1]?.[0]).toBe(visual);
    expect(result.current.phase).toBe('complete');
    unmount();
  });

  it('keeps the selected Voice while switching between visual edits until it is cleared', async () => {
    const sourceFile = new File(['source'], 'source.mp4', { type: 'video/mp4' });
    adapters.validateExistingVideo.mockResolvedValue(inspected(sourceFile));
    const { result, unmount } = renderHook(() =>
      useExistingVideoWorkflow({
        recording: recordingController(),
        processing: processingController(),
        publishUploadedVideo: vi.fn(),
      }),
    );

    await act(async () => result.current.selectFile(sourceFile));
    act(() => result.current.selectVoice('voice-northstar', 'Northstar Narrator'));
    expect(result.current.voiceSelection).toEqual({
      kind: 'elevenlabs',
      voiceId: 'voice-northstar',
      voiceName: 'Northstar Narrator',
    });

    act(() => {
      result.current.addStep('lucy-latest');
    });
    expect(result.current.voiceSelection?.voiceName).toBe('Northstar Narrator');

    act(() => {
      result.current.addStep('lucy-vton-latest');
    });
    expect(result.current.voiceSelection?.voiceName).toBe('Northstar Narrator');

    act(() => result.current.clearVoice());
    expect(result.current.voiceSelection).toBeNull();
    unmount();
  });

  it('supports a voice-only plan without contacting Decart', async () => {
    const sourceFile = new File(['source'], 'source.mp4', { type: 'video/mp4' });
    adapters.validateExistingVideo.mockResolvedValue(inspected(sourceFile));
    const recording = recordingController();
    const processing = processingController();
    processing.applyElevenLabsTo = vi.fn().mockResolvedValue({
      status: 'ready',
      artifact: recording.original,
    });
    const { result, unmount } = renderHook(() =>
      useExistingVideoWorkflow({
        recording,
        processing,
        publishUploadedVideo: vi.fn().mockReturnValue(recording.original),
      }),
    );

    await act(async () => result.current.selectFile(sourceFile));
    act(() => result.current.selectVoice('voice-northstar', 'Northstar Narrator'));
    await act(async () => result.current.submitPlan());

    expect(adapters.submitVideoJob).not.toHaveBeenCalled();
    expect(processing.applyElevenLabsTo).toHaveBeenCalledWith(
      recording.original,
      'voice-northstar',
      'Northstar Narrator',
      { replaceExistingResult: true },
    );
    expect(result.current.phase).toBe('complete');
    unmount();
  });

  it('applies a selected local voice effect without contacting a provider', async () => {
    const sourceFile = new File(['source'], 'source.mp4', { type: 'video/mp4' });
    adapters.validateExistingVideo.mockResolvedValue(inspected(sourceFile));
    const recording = recordingController();
    const processing = processingController();
    processing.applyLocalTo = vi.fn().mockResolvedValue({
      status: 'ready',
      artifact: recording.original,
    });
    const { result, unmount } = renderHook(() =>
      useExistingVideoWorkflow({
        recording,
        processing,
        publishUploadedVideo: vi.fn().mockReturnValue(recording.original),
      }),
    );

    await act(async () => result.current.selectFile(sourceFile));
    act(() => result.current.selectLocalVoice('warm-studio', 'Warm studio'));
    await act(async () => result.current.submitPlan());

    expect(adapters.submitVideoJob).not.toHaveBeenCalled();
    expect(processing.applyElevenLabsTo).not.toHaveBeenCalled();
    expect(processing.applyLocalTo).toHaveBeenCalledWith(recording.original, 'warm-studio', {
      replaceExistingResult: true,
    });
    expect(result.current.phase).toBe('complete');
    unmount();
  });

  it.each([
    { surface: 'status', code: 'job_expired', status: 410 },
    { surface: 'status', code: 'not_found', status: 404 },
    { surface: 'content', code: 'job_expired', status: 410 },
    { surface: 'content', code: 'not_found', status: 404 },
  ] as const)(
    'treats $code from $surface as terminal without another submission',
    async ({ surface, code, status }) => {
      const error = new ApiClientError('Temporary job unavailable.', status, code);
      if (surface === 'status') adapters.fetchVideoJob.mockRejectedValueOnce(error);
      else adapters.downloadVideoJobResult.mockRejectedValueOnce(error);
      const { result, recording, unmount } = await configuredVisualWorkflow();

      await act(async () => result.current.submitStep(0));

      expect(result.current.phase).toBe('error');
      expect(result.current.acceptedSubmission).toBe(false);
      expect(result.current.retryJob).toBeNull();
      expect(result.current.message).toContain(
        code === 'job_expired' ? 'temporary video job expired' : 'no longer available',
      );
      expect(result.current.message).toContain('new explicit provider submission');
      expect(result.current.message).toContain('may incur additional provider usage');
      expect(recording.presented).toBe(recording.original);
      expect(result.current.result).toBeNull();
      expect(adapters.submitVideoJob).toHaveBeenCalledTimes(1);

      await act(async () => result.current.retryExistingJob());
      expect(adapters.submitVideoJob).toHaveBeenCalledTimes(1);
      unmount();
    },
  );

  it('uses the same terminal copy for an expired status response', async () => {
    adapters.fetchVideoJob.mockImplementationOnce((jobId: string) =>
      Promise.resolve({
        ...jobStatus(jobId),
        status: 'expired',
        result: null,
        error: {
          code: 'job_expired',
          message: 'This temporary video job expired.',
        },
      }),
    );
    const { result, recording, unmount } = await configuredVisualWorkflow();

    await act(async () => result.current.submitStep(0));

    expect(result.current.phase).toBe('error');
    expect(result.current.acceptedSubmission).toBe(false);
    expect(result.current.retryJob).toBeNull();
    expect(result.current.message).toContain('new explicit provider submission');
    expect(result.current.message).toContain('may incur additional provider usage');
    expect(recording.presented).toBe(recording.original);
    expect(adapters.submitVideoJob).toHaveBeenCalledTimes(1);
    unmount();
  });

  it.each([
    {
      surface: 'status',
      error: new ApiClientError('Temporary server failure.', 503, 'internal_error'),
    },
    {
      surface: 'content',
      error: new ApiClientError('Temporary request timeout.', 504, 'request_timeout'),
    },
  ] as const)(
    'resumes a transient $surface failure without another submission',
    async ({ surface, error }) => {
      if (surface === 'status') adapters.fetchVideoJob.mockRejectedValueOnce(error);
      else adapters.downloadVideoJobResult.mockRejectedValueOnce(error);
      const { result, recording, unmount } = await configuredVisualWorkflow();

      await act(async () => result.current.submitStep(0));

      expect(result.current.phase).toBe('error');
      expect(result.current.acceptedSubmission).toBe(true);
      expect(result.current.retryJob).not.toBeNull();
      expect(result.current.message).toContain('resuming it does not create another submission');
      expect(recording.presented).toBe(recording.original);
      expect(adapters.submitVideoJob).toHaveBeenCalledTimes(1);

      await act(async () => result.current.retryExistingJob());
      await waitFor(() => expect(result.current.phase).toBe('complete'));
      expect(adapters.submitVideoJob).toHaveBeenCalledTimes(1);
      unmount();
    },
  );

  it('preserves editable drafts while an accepted job status check can be resumed', async () => {
    const sourceFile = new File(['source'], 'source.mp4', { type: 'video/mp4' });
    adapters.validateExistingVideo.mockResolvedValue(inspected(sourceFile));
    adapters.fetchVideoJob.mockRejectedValueOnce(
      new ApiClientError(
        'This provider action requires the exact local Studio origin.',
        403,
        'forbidden_origin',
      ),
    );
    const recording = recordingController();
    const { result, unmount } = renderHook(() =>
      useExistingVideoWorkflow({
        recording,
        processing: processingController(),
        publishUploadedVideo: vi.fn(),
      }),
    );

    await act(async () => result.current.selectFile(sourceFile));
    act(() => {
      result.current.addStep('lucy-latest');
    });
    const stepId = result.current.steps[0]!.id;
    act(() => result.current.updateStep(stepId, { prompt: 'Original accepted prompt' }));

    await act(async () => result.current.submitStep(0));

    expect(result.current.phase).toBe('error');
    expect(result.current.acceptedSubmission).toBe(true);
    expect(result.current.retryJob).not.toBeNull();
    expect(result.current.message).toContain('exact local Studio origin');
    expect(result.current.message).toContain('resuming it does not create another submission');

    act(() => result.current.updateStep(stepId, { prompt: 'Edited possible retry prompt' }));
    expect(result.current.steps[0]!.prompt).toBe('Edited possible retry prompt');

    await act(async () => result.current.retryExistingJob());
    await waitFor(() => expect(result.current.phase).toBe('complete'));

    expect(adapters.submitVideoJob).toHaveBeenCalledTimes(1);
    expect(adapters.submitVideoJob.mock.calls[0]![1]).toMatchObject({
      prompt: 'Original accepted prompt',
    });
    unmount();
  });

  it('does not resubmit a completed step when replacement validation fails', async () => {
    const sourceFile = new File(['source'], 'source.mp4', { type: 'video/mp4' });
    adapters.validateExistingVideo.mockResolvedValue(inspected(sourceFile));
    const { result, unmount } = renderHook(() =>
      useExistingVideoWorkflow({
        recording: recordingController(),
        processing: processingController(),
        publishUploadedVideo: vi.fn(),
      }),
    );

    await act(async () => result.current.selectFile(sourceFile));
    act(() => {
      result.current.addStep('lucy-latest');
    });
    act(() =>
      result.current.updateStep(result.current.steps[0]!.id, {
        prompt: 'Keep the completed recipe pinned',
      }),
    );
    await act(async () => result.current.submitStep(0));
    await waitFor(() => expect(result.current.phase).toBe('complete'));

    adapters.validateExistingVideo.mockRejectedValueOnce(new Error('Replacement is invalid.'));
    await act(async () =>
      result.current.selectFile(
        new File(['replacement'], 'replacement.mp4', { type: 'video/mp4' }),
      ),
    );

    expect(result.current.phase).toBe('error');
    expect(result.current.completedStepCount).toBe(1);
    expect(result.current.selection?.file).toBe(sourceFile);
    await act(async () => result.current.submitStep(result.current.completedStepCount));
    expect(adapters.submitVideoJob).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('clears a resume action when the accepted provider job reports terminal failure', async () => {
    const sourceFile = new File(['source'], 'source.mp4', { type: 'video/mp4' });
    adapters.validateExistingVideo.mockResolvedValue(inspected(sourceFile));
    adapters.fetchVideoJob
      .mockRejectedValueOnce(new TypeError('temporary network interruption'))
      .mockImplementationOnce((jobId: string) =>
        Promise.resolve({
          ...jobStatus(jobId),
          status: 'failed',
          result: null,
          error: {
            code: 'provider_rejected',
            message: 'Decart could not complete this visual processing request.',
          },
        }),
      );
    const { result, unmount } = renderHook(() =>
      useExistingVideoWorkflow({
        recording: recordingController(),
        processing: processingController(),
        publishUploadedVideo: vi.fn(),
      }),
    );

    await act(async () => result.current.selectFile(sourceFile));
    act(() => {
      result.current.addStep('lucy-latest');
    });
    act(() =>
      result.current.updateStep(result.current.steps[0]!.id, {
        prompt: 'Change the lighting',
      }),
    );
    await act(async () => result.current.submitStep(0));
    await act(async () => result.current.retryExistingJob());

    expect(result.current.phase).toBe('error');
    expect(result.current.acceptedSubmission).toBe(false);
    expect(result.current.retryJob).toBeNull();
    expect(result.current.message).toBe(
      'Decart could not complete this visual processing request.',
    );
    expect(adapters.releaseVideoJob).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('retains an explicit-user terminal failure until the user discards it', async () => {
    const sourceFile = new File(['source'], 'source.mp4', { type: 'video/mp4' });
    adapters.validateExistingVideo.mockResolvedValue(inspected(sourceFile));
    adapters.fetchVideoJob.mockImplementation((jobId: string) =>
      Promise.resolve({
        ...jobStatus(jobId),
        status: 'failed',
        result: null,
        error: {
          code: 'provider_rejected',
          message: 'Visual processing rejected the submitted media.',
        },
      }),
    );
    const recording = recordingController();
    const { result, unmount } = renderHook(() =>
      useExistingVideoWorkflow({
        recording,
        processing: processingController(),
        publishUploadedVideo: vi.fn(),
        videoProcessingCapabilities: {
          characterSwap: {
            available: true,
            inputPreparation: 'h264-mp4',
            referencePolicy: 'required',
            promptEnhancement: false,
            terminalFailureRelease: 'explicit-user',
          },
          virtualTryOn: {
            available: true,
            inputPreparation: 'none',
            referencePolicy: 'optional',
            promptEnhancement: true,
            terminalFailureRelease: 'automatic',
          },
        },
      }),
    );

    await act(async () => result.current.selectFile(sourceFile));
    act(() => {
      result.current.addStep('lucy-latest');
    });
    act(() => {
      result.current.updateStep(result.current.steps[0]!.id, {
        referenceImage: new File(['identity'], 'identity.png', { type: 'image/png' }),
      });
    });
    await act(async () => result.current.submitStep(0));

    expect(result.current.phase).toBe('error');
    expect(result.current.message).toBe('Visual processing rejected the submitted media.');
    expect(adapters.releaseVideoJob).not.toHaveBeenCalled();

    act(() => result.current.reset(true));
    expect(adapters.releaseVideoJob).toHaveBeenCalledOnce();
    expect(recording.discard).toHaveBeenCalledOnce();
    unmount();
  });
});
