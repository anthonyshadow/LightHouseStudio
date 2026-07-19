import OpenAI from 'openai';
import type { ImagesResponse } from 'openai/resources/images';
import {
  REFERENCE_IMAGE_MODEL_ID,
  REFERENCE_IMAGE_QUALITY,
  type CharacterPromptOptimizationResult,
} from '@studio/contracts';

export const OPENAI_REFERENCE_IMAGE_MODEL = REFERENCE_IMAGE_MODEL_ID;
export const OPENAI_REFERENCE_IMAGE_TIMEOUT_MS = 150_000;

export const OPENAI_REFERENCE_IMAGE_PARAMETERS = {
  model: OPENAI_REFERENCE_IMAGE_MODEL,
  n: 1,
  size: '1024x1024',
  quality: 'high',
  output_format: 'jpeg',
  output_compression: 90,
  background: 'opaque',
  moderation: 'low',
} as const;

export interface GeneratedReferenceImagePayload {
  readonly base64: string;
  readonly providerRequestId?: string;
}

export interface GenerateReferenceImageProviderInput {
  readonly prompt: string;
  readonly size: CharacterPromptOptimizationResult['recommendedSettings']['size'];
  readonly format: CharacterPromptOptimizationResult['recommendedSettings']['format'];
}

export interface ReferenceImageProvider {
  generate(input: GenerateReferenceImageProviderInput): Promise<GeneratedReferenceImagePayload>;
}

export type ReferenceImageProviderFailureReason =
  | 'authentication'
  | 'configuration'
  | 'failure'
  | 'invalid-response'
  | 'moderation'
  | 'rate-limit'
  | 'timeout';

export class ReferenceImageProviderError extends Error {
  readonly reason: ReferenceImageProviderFailureReason;
  readonly upstreamStatus?: number;

  constructor(
    reason: ReferenceImageProviderFailureReason,
    options?: { readonly upstreamStatus?: number; readonly cause?: unknown },
  ) {
    super(`OpenAI reference image generation failed: ${reason}`, {
      cause: options?.cause,
    });
    this.name = 'ReferenceImageProviderError';
    this.reason = reason;
    if (options?.upstreamStatus !== undefined) this.upstreamStatus = options.upstreamStatus;
  }
}

interface OpenAIImageClient {
  readonly images: {
    generate(
      parameters: Omit<
        typeof OPENAI_REFERENCE_IMAGE_PARAMETERS,
        'model' | 'output_compression' | 'output_format' | 'quality' | 'size'
      > & {
        readonly model: string;
        readonly output_compression?: number;
        readonly quality: 'high' | 'medium';
        readonly size: GenerateReferenceImageProviderInput['size'];
        readonly output_format: GenerateReferenceImageProviderInput['format'];
        readonly prompt: string;
      },
    ): Promise<ImagesResponse>;
  };
}

type OpenAIClientFactory = (options: {
  readonly apiKey: string;
  readonly maxRetries: 0;
  readonly timeout: number;
}) => OpenAIImageClient;

const isOpenAIError = (
  error: unknown,
): error is Error & { readonly code?: string | null; readonly status?: number } =>
  error instanceof Error;

const isModerationFailure = (error: Error & { readonly code?: string | null }): boolean =>
  error.code === 'moderation_blocked';

const normalizeOpenAIError = (error: unknown): ReferenceImageProviderError => {
  if (error instanceof ReferenceImageProviderError) return error;
  if (!isOpenAIError(error)) return new ReferenceImageProviderError('failure', { cause: error });

  const status = typeof error.status === 'number' ? error.status : undefined;
  const options =
    status === undefined ? { cause: error } : { cause: error, upstreamStatus: status };

  if (error.name === 'APIConnectionTimeoutError') {
    return new ReferenceImageProviderError('timeout', options);
  }
  if (status === 401) return new ReferenceImageProviderError('authentication', options);
  if (status === 429) return new ReferenceImageProviderError('rate-limit', options);
  if ((status === 400 || status === 403) && isModerationFailure(error)) {
    return new ReferenceImageProviderError('moderation', options);
  }
  return new ReferenceImageProviderError('failure', options);
};

const defaultClientFactory: OpenAIClientFactory = (options) => new OpenAI(options);

export class OpenAIReferenceImageProvider implements ReferenceImageProvider {
  readonly #client: OpenAIImageClient;
  readonly #model: string;
  readonly #quality: 'high' | 'medium';

  constructor(
    apiKey: string,
    options: {
      readonly model?: string;
      readonly quality?: 'high' | 'medium';
      readonly timeoutMs?: number;
    } = {},
    clientFactory: OpenAIClientFactory = defaultClientFactory,
  ) {
    this.#model = options.model ?? OPENAI_REFERENCE_IMAGE_MODEL;
    this.#quality = options.quality ?? REFERENCE_IMAGE_QUALITY;
    this.#client = clientFactory({
      apiKey,
      maxRetries: 0,
      timeout: options.timeoutMs ?? OPENAI_REFERENCE_IMAGE_TIMEOUT_MS,
    });
  }

  async generate(
    input: GenerateReferenceImageProviderInput,
  ): Promise<GeneratedReferenceImagePayload> {
    try {
      // GPT Image models always return base64. response_format and user are deliberately omitted.
      const { output_compression: outputCompression, ...parameters } =
        OPENAI_REFERENCE_IMAGE_PARAMETERS;
      const response = await this.#client.images.generate({
        ...parameters,
        model: this.#model,
        quality: this.#quality,
        size: input.size,
        output_format: input.format,
        ...(input.format === 'jpeg' || input.format === 'webp'
          ? { output_compression: outputCompression }
          : {}),
        prompt: input.prompt,
      });
      const base64 = response.data?.[0]?.b64_json;
      if (typeof base64 !== 'string' || base64.length === 0) {
        throw new ReferenceImageProviderError('invalid-response');
      }
      const providerRequestId = (response as ImagesResponse & { readonly _request_id?: unknown })
        ._request_id;
      return {
        base64,
        ...(typeof providerRequestId === 'string' && providerRequestId.length > 0
          ? { providerRequestId }
          : {}),
      };
    } catch (error) {
      throw normalizeOpenAIError(error);
    }
  }
}
