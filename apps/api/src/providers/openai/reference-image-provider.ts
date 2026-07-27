import OpenAI, { toFile, type Uploadable } from 'openai';
import type { ImagesResponse } from 'openai/resources/images';
import { REFERENCE_IMAGE_MODEL_ID, REFERENCE_IMAGE_QUALITY } from '@studio/contracts';
import {
  decodeProviderBase64,
  mimeTypeForReferenceImageFormat,
  type EditReferenceImageProviderInput,
  type GenerateReferenceImageProviderInput,
  type GeneratedReferenceImagePayload,
  type ReferenceImageProvider,
  ReferenceImageProviderError,
} from '../reference-images/reference-image-provider.js';
import { classifyOpenAITransportFailure, openAIUpstreamStatus } from './transport-error.js';

export {
  type EditReferenceImageProviderInput,
  type GenerateReferenceImageProviderInput,
  type GeneratedReferenceImagePayload,
  type ReferenceImageProvider,
  type ReferenceImageProviderFailureReason,
  ReferenceImageProviderError,
} from '../reference-images/reference-image-provider.js';

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
      options?: { readonly signal?: AbortSignal },
    ): Promise<ImagesResponse>;
    edit?(
      parameters: {
        readonly image: Uploadable;
        readonly model: string;
        readonly moderation: 'low';
        readonly n: 1;
        readonly background: 'opaque';
        readonly output_compression?: number;
        readonly quality: 'high' | 'medium';
        readonly size: EditReferenceImageProviderInput['size'];
        readonly output_format: EditReferenceImageProviderInput['format'];
        readonly prompt: string;
      },
      options?: { readonly signal?: AbortSignal },
    ): Promise<ImagesResponse>;
  };
}

type OpenAIClientFactory = (options: {
  readonly apiKey: string;
  readonly maxRetries: 0;
  readonly timeout: number;
}) => OpenAIImageClient;

const isModerationFailure = (error: Error & { readonly code?: string | null }): boolean =>
  error.code === 'moderation_blocked';

const normalizeOpenAIError = (error: unknown): ReferenceImageProviderError => {
  if (error instanceof ReferenceImageProviderError) return error;
  const status = openAIUpstreamStatus(error);
  const options =
    status === undefined ? { cause: error } : { cause: error, upstreamStatus: status };
  const transportFailure = classifyOpenAITransportFailure(error);
  if (transportFailure !== undefined) {
    return new ReferenceImageProviderError(transportFailure.reason, options);
  }
  if (error instanceof Error && (status === 400 || status === 403) && isModerationFailure(error)) {
    return new ReferenceImageProviderError('moderation', options);
  }
  return new ReferenceImageProviderError('failure', options);
};

const defaultClientFactory: OpenAIClientFactory = (options) => new OpenAI(options);

const extensionForMimeType = (
  mimeType: EditReferenceImageProviderInput['source']['mimeType'],
): string => {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  return 'jpg';
};

const imagePayload = (
  response: ImagesResponse,
  format: GenerateReferenceImageProviderInput['format'],
  modelId: string,
): GeneratedReferenceImagePayload => {
  const base64 = response.data?.[0]?.b64_json;
  if (typeof base64 !== 'string' || base64.length === 0) {
    throw new ReferenceImageProviderError('invalid-response');
  }
  const providerRequestId = (response as ImagesResponse & { readonly _request_id?: unknown })
    ._request_id;
  return {
    bytes: decodeProviderBase64(base64, 'openai'),
    mimeType: mimeTypeForReferenceImageFormat(format),
    providerId: 'openai',
    modelId,
    ...(typeof providerRequestId === 'string' && providerRequestId.length > 0
      ? { providerRequestId }
      : {}),
  };
};

export class OpenAIReferenceImageProvider implements ReferenceImageProvider {
  readonly descriptor;
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
    this.descriptor = {
      providerId: 'openai' as const,
      modelId: this.#model,
      adapterVersion: 'openai-gpt-image-v1',
      effectiveSettings: {
        quality: this.#quality,
        background: OPENAI_REFERENCE_IMAGE_PARAMETERS.background,
        moderation: OPENAI_REFERENCE_IMAGE_PARAMETERS.moderation,
        outputCompression: OPENAI_REFERENCE_IMAGE_PARAMETERS.output_compression,
      },
    };
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
      const request = {
        ...parameters,
        model: this.#model,
        quality: this.#quality,
        size: input.size,
        output_format: input.format,
        ...(input.format === 'jpeg' || input.format === 'webp'
          ? { output_compression: outputCompression }
          : {}),
        prompt: input.prompt,
      };
      const response =
        input.signal === undefined
          ? await this.#client.images.generate(request)
          : await this.#client.images.generate(request, { signal: input.signal });
      return imagePayload(response, input.format, this.#model);
    } catch (error) {
      throw normalizeOpenAIError(error);
    }
  }

  async edit(input: EditReferenceImageProviderInput): Promise<GeneratedReferenceImagePayload> {
    try {
      const edit = this.#client.images.edit?.bind(this.#client.images);
      if (edit === undefined) throw new ReferenceImageProviderError('configuration');
      const source = await toFile(
        input.source.bytes,
        `reference.${extensionForMimeType(input.source.mimeType)}`,
        { type: input.source.mimeType },
      );
      const request = {
        image: source,
        model: this.#model,
        moderation: OPENAI_REFERENCE_IMAGE_PARAMETERS.moderation,
        n: 1 as const,
        background: 'opaque' as const,
        quality: this.#quality,
        size: input.size,
        output_format: input.format,
        ...(input.format === 'jpeg' || input.format === 'webp'
          ? { output_compression: OPENAI_REFERENCE_IMAGE_PARAMETERS.output_compression }
          : {}),
        prompt: input.prompt,
      };
      const response =
        input.signal === undefined
          ? await edit(request)
          : await edit(request, { signal: input.signal });
      return imagePayload(response, input.format, this.#model);
    } catch (error) {
      throw normalizeOpenAIError(error);
    }
  }
}
