import type { CharacterPromptOptimizationResult, ReferenceImageSize } from '@studio/contracts';

export type ReferenceImageProviderId = 'openai' | 'bfl';
export type ReferenceImageMimeType = 'image/jpeg' | 'image/png' | 'image/webp';
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
  /**
   * Optional only for legacy injected test doubles. Production adapters always
   * expose an authoritative descriptor.
   */
  readonly descriptor?: ReferenceImageProviderDescriptor;
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
  readonly providerId: ReferenceImageProviderId;
  readonly upstreamStatus?: number;
  readonly providerRequestId?: string;
  readonly providerStage?: ReferenceImageProviderStage;

  constructor(
    reason: ReferenceImageProviderFailureReason,
    options?: {
      readonly providerId?: ReferenceImageProviderId;
      readonly upstreamStatus?: number;
      readonly providerRequestId?: string;
      readonly providerStage?: ReferenceImageProviderStage;
      readonly cause?: unknown;
    },
  ) {
    const providerId = options?.providerId ?? 'openai';
    super(`${providerId} reference image request failed: ${reason}`, {
      cause: options?.cause,
    });
    this.name = 'ReferenceImageProviderError';
    this.reason = reason;
    this.providerId = providerId;
    if (options?.upstreamStatus !== undefined) this.upstreamStatus = options.upstreamStatus;
    if (options?.providerRequestId !== undefined) {
      this.providerRequestId = options.providerRequestId;
    }
    if (options?.providerStage !== undefined) this.providerStage = options.providerStage;
  }
}

export const MAX_PROVIDER_IMAGE_BYTES = 32 * 1024 * 1024;
const MAX_PROVIDER_BASE64_LENGTH = Math.ceil(MAX_PROVIDER_IMAGE_BYTES / 3) * 4;

const isBase64AlphabetCode = (code: number): boolean =>
  (code >= 0x41 && code <= 0x5a) ||
  (code >= 0x61 && code <= 0x7a) ||
  (code >= 0x30 && code <= 0x39) ||
  code === 0x2b ||
  code === 0x2f;

const hasCanonicalBase64Shape = (encoded: string): boolean => {
  if (
    encoded.length === 0 ||
    encoded.length % 4 !== 0 ||
    encoded.length > MAX_PROVIDER_BASE64_LENGTH
  ) {
    return false;
  }
  const padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0;
  const contentLength = encoded.length - padding;
  for (let index = 0; index < contentLength; index += 1) {
    if (!isBase64AlphabetCode(encoded.charCodeAt(index))) return false;
  }
  return true;
};

/** Strictly decodes an inline provider image without accepting whitespace or URL-safe variants. */
export const decodeProviderBase64 = (
  encoded: string,
  providerId: ReferenceImageProviderId,
): Buffer => {
  if (!hasCanonicalBase64Shape(encoded)) {
    throw new ReferenceImageProviderError('invalid-response', { providerId });
  }
  const bytes = Buffer.from(encoded, 'base64');
  if (
    bytes.byteLength === 0 ||
    bytes.byteLength > MAX_PROVIDER_IMAGE_BYTES ||
    bytes.toString('base64') !== encoded
  ) {
    throw new ReferenceImageProviderError('invalid-response', { providerId });
  }
  return bytes;
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
