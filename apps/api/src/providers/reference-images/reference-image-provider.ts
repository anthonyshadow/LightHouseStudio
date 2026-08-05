import type { CharacterPromptOptimizationResult, ReferenceImageSize } from '@studio/contracts';
import type { ImageMimeType } from '@studio/domain';
import { decodeCanonicalBase64 } from '../../application/strict-base64.js';

export type ReferenceImageProviderId = 'openai' | 'bfl' | 'wiro';
export type ReferenceImageProviderErrorId = ReferenceImageProviderId | 'pruna';
export type ReferenceImageMimeType = ImageMimeType;
export type ReferenceImageProviderStage = 'submission' | 'polling' | 'download';

export interface ReferenceImageProviderDescriptor {
  readonly providerId: ReferenceImageProviderId;
  readonly modelId: string;
  readonly adapterVersion: string;
  readonly effectiveSettings: Readonly<Record<string, string | number | boolean>>;
}

export interface GeneratedReferenceImagePayload {
  readonly bytes: Uint8Array;
  readonly mimeType: ReferenceImageMimeType;
  readonly providerId: ReferenceImageProviderId;
  readonly modelId: string;
  readonly providerRequestId?: string;
  readonly safeUsage?: Readonly<Record<string, number>>;
  /**
   * Best-effort cleanup for provider-hosted input/output artifacts. The service
   * invokes this only after the local persistence attempt has settled.
   */
  readonly cleanupRemoteArtifacts?: () => Promise<void>;
}

export interface GenerateReferenceImageProviderInput {
  readonly prompt: string;
  readonly size: ReferenceImageSize;
  readonly format: CharacterPromptOptimizationResult['recommendedSettings']['format'];
  readonly signal?: AbortSignal;
}

export interface EditReferenceImageProviderInput extends GenerateReferenceImageProviderInput {
  readonly source: {
    readonly bytes: Uint8Array;
    readonly mimeType: ReferenceImageMimeType;
  };
}

export interface ReferenceImageProvider {
  readonly descriptor: ReferenceImageProviderDescriptor;
  generate: (input: GenerateReferenceImageProviderInput) => Promise<GeneratedReferenceImagePayload>;
  edit?: (input: EditReferenceImageProviderInput) => Promise<GeneratedReferenceImagePayload>;
}

export type ReferenceImageProviderFailureReason =
  | 'authentication'
  | 'aborted'
  | 'configuration'
  | 'connection'
  | 'credits'
  | 'failure'
  | 'invalid-request'
  | 'invalid-response'
  | 'moderation'
  | 'rate-limit'
  | 'timeout';

export class ReferenceImageProviderError extends Error {
  readonly reason: ReferenceImageProviderFailureReason;
  readonly providerId: ReferenceImageProviderErrorId;
  readonly upstreamStatus?: number;
  readonly providerRequestId?: string;
  readonly providerStage?: ReferenceImageProviderStage;

  constructor(
    reason: ReferenceImageProviderFailureReason,
    options: {
      readonly providerId: ReferenceImageProviderErrorId;
      readonly upstreamStatus?: number;
      readonly providerRequestId?: string;
      readonly providerStage?: ReferenceImageProviderStage;
      readonly cause?: unknown;
    },
  ) {
    const providerId = options.providerId;
    super(`${providerId} reference image request failed: ${reason}`, {
      cause: options.cause,
    });
    this.name = 'ReferenceImageProviderError';
    this.reason = reason;
    this.providerId = providerId;
    if (options.upstreamStatus !== undefined) this.upstreamStatus = options.upstreamStatus;
    if (options.providerRequestId !== undefined) {
      this.providerRequestId = options.providerRequestId;
    }
    if (options.providerStage !== undefined) this.providerStage = options.providerStage;
  }
}

export const MAX_PROVIDER_IMAGE_BYTES = 32 * 1024 * 1024;

/** Strictly decodes an inline provider image without accepting whitespace or URL-safe variants. */
export const decodeProviderBase64 = (
  encoded: string,
  providerId: ReferenceImageProviderId,
): Buffer => {
  const decoded = decodeCanonicalBase64(encoded, MAX_PROVIDER_IMAGE_BYTES);
  if (!decoded.ok) {
    throw new ReferenceImageProviderError('invalid-response', { providerId });
  }
  return decoded.bytes;
};

export const mimeTypeForReferenceImageFormat = (
  format: GenerateReferenceImageProviderInput['format'],
): ReferenceImageMimeType => {
  if (format === 'png') return 'image/png';
  if (format === 'webp') return 'image/webp';
  return 'image/jpeg';
};

export const dimensionsForReferenceImageSize = (
  size: ReferenceImageSize,
): { readonly width: 1024 | 1536; readonly height: 1024 | 1536 } => {
  switch (size) {
    case '1024x1024':
      return { width: 1024, height: 1024 };
    case '1024x1536':
      return { width: 1024, height: 1536 };
    case '1536x1024':
      return { width: 1536, height: 1024 };
  }
};
