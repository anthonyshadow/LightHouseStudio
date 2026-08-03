import type { ModelModeId } from '../session';

export type UploadedVideoContainer = 'mp4' | 'quicktime' | 'webm';
export type UploadedVideoCodec = 'avc' | 'vp8';

export type UploadedVideoFacts = Readonly<{
  container: UploadedVideoContainer;
  videoCodec: string;
  durationMs: number;
  width: number;
  height: number;
  sizeBytes: number;
  hasAudio: boolean;
}>;

export type VideoTransformOperationId = 'character-swap' | 'virtual-try-on';

export type VideoTransformStep = Readonly<{
  id: string;
  modelId: ModelModeId;
  prompt: string;
  hasReferenceImage: boolean;
  enhancePrompt: boolean;
  inputKind?: 'character' | 'saved-outfit' | 'reference-image' | 'prompt';
}>;

export type UploadedVideoValidationCode =
  | 'invalid-video'
  | 'unsupported-container'
  | 'unsupported-codec'
  | 'unsupported-aspect-ratio'
  | 'duration-exceeded'
  | 'payload-too-large';

export type UploadedVideoValidationIssue = Readonly<{
  code: UploadedVideoValidationCode;
  message: string;
}>;
