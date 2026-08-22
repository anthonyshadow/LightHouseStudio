import { fn } from 'storybook/test';
import {
  createEmptyDraft,
  type StudioMode,
  type StudioSessionController,
} from '@web/features/media-session';
import type {
  CapturePreferencesController,
  RecordingArtifact,
  RecordingController,
  RecordingSource,
} from '@web/features/recording';
import type { VoiceProcessingController } from '@web/features/voice-effects/types';

export const emptyMediaStream = (): MediaStream =>
  ({
    active: true,
    id: 'storybook-stream',
    getTracks: () => [],
    getAudioTracks: () => [],
    getVideoTracks: () => [],
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }) as unknown as MediaStream;

export const createTakeArtifact = (
  overrides: Partial<RecordingArtifact> = {},
): RecordingArtifact => {
  const media = new Blob(['storybook-take'], { type: 'video/webm' });
  return {
    id: 'take-storybook',
    media,
    objectUrl: 'blob:storybook-take',
    mimeType: media.type,
    filename: 'lightframe-storybook-take.webm',
    sourceModeId: 'local',
    startedAt: '2026-07-25T14:00:00.000Z',
    durationMs: 12_400,
    sizeBytes: 3_482_624,
    ...overrides,
  };
};

export const createSessionController = (
  mode: StudioMode = 'local',
  overrides: Partial<StudioSessionController> = {},
): StudioSessionController => ({
  draft: createEmptyDraft(mode),
  applied: null,
  lifecycle: 'idle',
  localStream: null,
  remoteStream: null,
  displayStream: null,
  transformedVideoUsable: false,
  realtimeSessionTiming: null,
  pendingChanges: false,
  error: null,
  applying: false,
  microphoneEnabled: true,
  cameraEnabled: true,
  startLocal: fn(() => Promise.resolve()),
  preflight: fn(() => Promise.resolve()),
  startModel: fn(() => Promise.resolve()),
  applyChanges: fn(() => Promise.resolve()),
  revertDraft: fn(),
  stopModel: fn(() => Promise.resolve()),
  completeExpectedModelSession: fn(() => Promise.resolve()),
  resetModel: fn(),
  stopCamera: fn(() => Promise.resolve()),
  releaseForRecordedReview: fn(() => Promise.resolve()),
  toggleMicrophone: fn(),
  toggleCamera: fn(),
  selectMode: fn(() => true),
  canReplaceRecipeDraft: fn(() => true),
  replaceRecipeDraft: fn(() => true),
  updatePrompt: fn(),
  updateEnhancement: fn(),
  updateReferenceImage: fn(),
  clearError: fn(),
  ...overrides,
});

export const createRecordingSource = (): RecordingSource => ({
  stream: emptyMediaStream(),
  videoSource: 'local',
  audioSource: 'microphone',
});

const restorePersistedOriginal: RecordingController['restorePersistedOriginal'] = (input) =>
  Object.assign(
    createTakeArtifact({
      media: input.blob,
      objectUrl: 'blob:restored-take',
      sizeBytes: input.blob.size,
    }),
    input.artifactMetadata,
  );

const presentRemoteOriginal: RecordingController['presentRemoteOriginal'] = (input) =>
  Object.assign(
    createTakeArtifact({
      objectUrl: input.remoteMedia.contentUrl,
      sizeBytes: input.remoteMedia.sizeBytes,
    }),
    input.artifactMetadata,
    { media: input.remoteMedia },
  );

const completeProcessing: RecordingController['completeProcessing'] = (blob, mimeType, label) =>
  createTakeArtifact({
    id: 'processed-storybook',
    media: blob,
    objectUrl: 'blob:processed-storybook',
    mimeType,
    filename: `${label}.webm`,
    sizeBytes: blob.size,
  });

const completeVisualProcessing: RecordingController['completeVisualProcessing'] = (
  blob,
  mimeType,
  label,
) =>
  createTakeArtifact({
    id: 'visual-storybook',
    media: blob,
    objectUrl: 'blob:visual-storybook',
    mimeType,
    filename: `${label}.webm`,
    sizeBytes: blob.size,
  });

export const createRecordingController = (
  overrides: Partial<RecordingController> = {},
): RecordingController => {
  const controller: RecordingController = {
    lifecycle: 'idle',
    activeSource: null,
    metadata: null,
    original: null,
    visual: null,
    processed: null,
    presented: null,
    sidecar: { state: 'unavailable', blob: null, mimeType: null, error: null },
    recordingError: null,
    processingState: 'idle',
    processingOperation: null,
    processingError: null,
    elapsedSeconds: 0,
    start: fn(() => Promise.resolve()),
    stop: fn(() => Promise.resolve(null)),
    restorePersistedOriginal: fn(restorePersistedOriginal),
    presentRemoteOriginal: fn(presentRemoteOriginal),
    replaceSource: fn(restorePersistedOriginal),
    discard: fn(),
    beginProcessing: fn(),
    cancelProcessing: fn(),
    completeVisualProcessing: fn(completeVisualProcessing),
    completeProcessing: fn(completeProcessing),
    failProcessing: fn(),
    repairPresentedObjectUrl: fn(() => false),
    clearVisualProcessing: fn(),
    restoreOriginal: fn(),
  };

  Object.assign(controller, overrides);
  return controller;
};

export const createRecordedController = (
  overrides: Partial<RecordingController> = {},
): RecordingController => {
  const original = createTakeArtifact();
  return createRecordingController({
    lifecycle: 'recorded',
    metadata: {
      mode: 'local',
      startedAt: original.startedAt,
      width: 1_920,
      height: 1_080,
      frameRate: 29.97,
      videoSource: 'local',
      audioSource: 'microphone',
      videoSourceLabel: 'Studio Camera',
      audioSourceLabel: 'Creator Microphone',
    },
    original,
    presented: original,
    sidecar: {
      state: 'ready',
      blob: new Blob(['storybook-audio'], { type: 'audio/webm' }),
      mimeType: 'audio/webm',
      error: null,
    },
    elapsedSeconds: 12,
    ...overrides,
  });
};

export const createVoiceProcessingController = (
  overrides: Partial<VoiceProcessingController> = {},
): VoiceProcessingController => {
  const cancelLocalProcessing: VoiceProcessingController['applyLocalTo'] = () =>
    Promise.resolve({ status: 'canceled' });
  const cancelElevenLabsProcessing: VoiceProcessingController['applyElevenLabsTo'] = () =>
    Promise.resolve({ status: 'canceled' });
  const controller: VoiceProcessingController = {
    selection: { kind: 'local', effect: 'warm-studio' },
    applyLocal: fn(() => Promise.resolve()),
    applyLocalTo: fn(cancelLocalProcessing),
    applyElevenLabs: fn(() => Promise.resolve()),
    applyElevenLabsTo: fn(cancelElevenLabsProcessing),
    restoreOriginal: fn(),
    cancel: fn(),
  };

  Object.assign(controller, overrides);
  return controller;
};

export const createCapturePreferencesController = (
  overrides: Partial<CapturePreferencesController> = {},
): CapturePreferencesController => ({
  draft: {
    videoDeviceId: 'camera-1',
    audioDeviceId: 'microphone-1',
    profile: '1080p30',
    aspectRatio: '9:16',
  },
  applied: {
    videoDeviceId: 'camera-1',
    audioDeviceId: 'microphone-1',
    profile: '720p30',
    aspectRatio: '16:9',
  },
  effectiveApplied: {
    videoDeviceId: 'camera-1',
    audioDeviceId: 'microphone-1',
    profile: '720p30',
    aspectRatio: '16:9',
  },
  cameraDevices: [
    { deviceId: 'camera-1', label: 'Studio Camera' },
    { deviceId: 'camera-2', label: 'Desk Camera' },
  ],
  microphoneDevices: [
    { deviceId: 'microphone-1', label: 'Creator Microphone' },
    { deviceId: 'microphone-2', label: 'Built-in Microphone' },
  ],
  supportedProfiles: ['720p30', '1080p30'],
  devicesState: 'ready',
  cameraPermissionState: 'granted',
  deviceError: null,
  videoFallbackNotice: null,
  applyError: null,
  applying: false,
  hasPendingChanges: true,
  actualSettings: {
    video: {
      label: 'Studio Camera',
      deviceId: 'camera-1',
      width: 1_920,
      height: 1_080,
      frameRate: 30,
    },
    audio: { label: 'Creator Microphone', deviceId: 'microphone-1' },
  },
  refreshDevices: fn(() => Promise.resolve()),
  updateVideoDeviceId: fn(),
  updateAudioDeviceId: fn(),
  updateProfile: fn(),
  updateAspectRatio: fn(),
  restoreAspectRatio: fn(() => true),
  reportVideoDeviceUnavailable: fn(),
  dismissVideoFallbackNotice: fn(),
  apply: fn(() => Promise.resolve(true)),
  discardPending: fn(),
  ...overrides,
});
