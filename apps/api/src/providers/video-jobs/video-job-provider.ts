import type {
  VideoInputMimeType,
  VideoTransformOperationId,
  VideoTransformRecipe,
} from '@studio/contracts';

export type VideoJobProviderStatus = 'pending' | 'processing' | 'completed' | 'failed';
export type VideoJobOutputResolution = '720p' | '1080p';
export type VideoJobOutputSizing = 'exact-canonical' | 'megapixel-budget';

export type VideoJobProviderFailureReason =
  | 'aborted'
  | 'timeout'
  | 'authentication'
  | 'billing'
  | 'quota'
  | 'policy'
  | 'rejected'
  | 'generation-failed'
  | 'invalid-response'
  | 'result-too-large'
  | 'upstream';

export class VideoJobProviderError extends Error {
  readonly reason: VideoJobProviderFailureReason;
  readonly upstreamStatus?: number;

  constructor(reason: VideoJobProviderFailureReason, upstreamStatus?: number) {
    super('Visual processing provider request failed.');
    this.name = 'VideoJobProviderError';
    this.reason = reason;
    if (upstreamStatus !== undefined) this.upstreamStatus = upstreamStatus;
  }

  get retryable(): boolean {
    return this.reason === 'timeout' || this.reason === 'upstream';
  }
}

export interface ExistingVideoJobProvider {
  submit(input: {
    readonly operation: VideoTransformOperationId;
    readonly recipe: VideoTransformRecipe;
    readonly videoPath: string;
    readonly videoMimeType: VideoInputMimeType;
    readonly referenceImagePath: string | null;
    readonly referenceImageMimeType: 'image/jpeg' | 'image/png' | 'image/webp' | null;
    readonly signal: AbortSignal;
  }): Promise<{
    readonly providerJobId: string;
    readonly status: VideoJobProviderStatus;
    readonly outputLocation?: string;
  }>;
  status(
    providerJobId: string,
    signal: AbortSignal,
  ): Promise<{
    readonly status: VideoJobProviderStatus;
    readonly outputLocation?: string;
    readonly failureReason?: VideoJobProviderFailureReason;
  }>;
  download(
    providerJobId: string,
    destinationPath: string,
    signal: AbortSignal,
    outputLocation?: string | null,
  ): Promise<void>;
  cancel?(providerJobId: string, signal: AbortSignal): Promise<void>;
}

export interface ExistingVideoOperationBinding {
  readonly provider: ExistingVideoJobProvider;
  readonly outputResolution: VideoJobOutputResolution;
  readonly outputSizing: VideoJobOutputSizing;
  readonly inputPreparation: 'none' | 'h264-mp4';
  readonly referencePolicy: 'optional' | 'required';
  readonly promptEnhancement: boolean;
  readonly terminalFailureRelease?: 'automatic' | 'explicit-user';
}

export type ExistingVideoProviderRegistry = Readonly<
  Record<VideoTransformOperationId, ExistingVideoOperationBinding | null>
>;
