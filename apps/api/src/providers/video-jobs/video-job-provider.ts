import type {
  VideoInputMimeType,
  VideoOutputResolution,
  VideoTransformOperationId,
  VideoTransformRecipe,
} from '@studio/contracts';
import type { ImageMimeType } from '@studio/domain';

export type VideoJobProviderStatus = 'pending' | 'processing' | 'completed' | 'failed';
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

export const videoJobFailureReasonForHttpStatus = (
  status: number,
): VideoJobProviderFailureReason => {
  if (status === 401) return 'authentication';
  if (status === 402) return 'billing';
  if (status === 403) return 'policy';
  if (status === 429) return 'quota';
  if (status === 400 || status === 409 || status === 415 || status === 422) return 'rejected';
  return 'upstream';
};

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
    readonly referenceImageMimeType: ImageMimeType | null;
    readonly outputResolution: VideoOutputResolution;
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
}

export interface ExistingVideoOperationBinding {
  readonly provider: ExistingVideoJobProvider;
  readonly outputResolutions: readonly VideoOutputResolution[];
  readonly defaultOutputResolution: VideoOutputResolution;
  readonly outputSizing: VideoJobOutputSizing;
  readonly inputPreparation: 'none' | 'h264-mp4';
  readonly referencePolicy: 'optional' | 'required';
  readonly promptInput: 'editable' | 'server-default';
  readonly promptEnhancement: boolean;
  readonly terminalFailureRelease?: 'automatic' | 'explicit-user';
}

export type ExistingVideoProviderRegistry = Readonly<
  Record<VideoTransformOperationId, ExistingVideoOperationBinding | null>
>;
