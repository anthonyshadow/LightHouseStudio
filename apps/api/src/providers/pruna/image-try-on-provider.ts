import { z } from 'zod';
import { PRUNA_IMAGE_TRY_ON_MODEL, REFERENCE_IMAGE_UPLOAD_MAX_BYTES } from '@studio/contracts';
import { imageFileExtension } from '@studio/domain';
import {
  type ReferenceImageMimeType,
  ReferenceImageProviderError,
} from '../reference-images/reference-image-provider.js';
import {
  abortableDelay,
  createProviderOperationDeadline,
  readBoundedJson,
} from '../transport/bounded-provider-transport.js';

const PRUNA_API_ORIGIN = 'https://api.pruna.ai' as const;
const PRUNA_FILES_PATH = '/v1/files' as const;
const PRUNA_PREDICTIONS_PATH = '/v1/predictions' as const;
const DEFAULT_TIMEOUT_MS = 150_000;
const INITIAL_POLL_DELAY_MS = 500;
const MAX_POLL_DELAY_MS = 3_000;

const uploadResponseSchema = z
  .object({ urls: z.object({ get: z.url() }).passthrough() })
  .passthrough();
const submitResponseSchema = z
  .object({ id: z.string().trim().min(1).max(500), get_url: z.url() })
  .passthrough();
const statusResponseSchema = z
  .object({
    status: z.enum(['starting', 'processing', 'succeeded', 'failed', 'canceled']),
    generation_url: z.url().optional(),
    error: z.string().max(2_000).nullish(),
  })
  .passthrough();

export interface OutfitTryOnProviderInput {
  readonly person: { readonly bytes: Uint8Array; readonly mimeType: ReferenceImageMimeType };
  readonly garment: { readonly bytes: Uint8Array; readonly mimeType: ReferenceImageMimeType };
  readonly signal?: AbortSignal;
}

export interface OutfitTryOnProvider {
  readonly modelId: typeof PRUNA_IMAGE_TRY_ON_MODEL;
  tryOn(input: OutfitTryOnProviderInput): Promise<OutfitTryOnProviderResult>;
}

export interface OutfitTryOnProviderResult {
  readonly bytes: Uint8Array;
  readonly mimeType: ReferenceImageMimeType;
  readonly providerId: 'pruna';
  readonly modelId: typeof PRUNA_IMAGE_TRY_ON_MODEL;
  readonly providerRequestId?: string;
}

const providerError = (
  reason: ConstructorParameters<typeof ReferenceImageProviderError>[0],
  options: Omit<
    NonNullable<ConstructorParameters<typeof ReferenceImageProviderError>[1]>,
    'providerId'
  > = {},
): ReferenceImageProviderError =>
  new ReferenceImageProviderError(reason, { providerId: 'pruna', ...options });

const failureForHttpStatus = (
  status: number,
  providerRequestId?: string,
): ReferenceImageProviderError => {
  const options = {
    upstreamStatus: status,
    ...(providerRequestId === undefined ? {} : { providerRequestId }),
  };
  if (status === 400 || status === 404 || status === 409 || status === 415 || status === 422) {
    return providerError('invalid-request', options);
  }
  if (status === 401 || status === 403) return providerError('authentication', options);
  if (status === 402) return providerError('credits', options);
  if (status === 429) return providerError('rate-limit', options);
  return providerError('failure', options);
};

const trustedProviderUrl = (candidate: string, pathPrefix: string): URL => {
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw providerError('invalid-response');
  }
  if (
    parsed.origin !== PRUNA_API_ORIGIN ||
    !parsed.pathname.startsWith(pathPrefix) ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw providerError('invalid-response');
  }
  return parsed;
};

const readLimitedJson = (response: Response): Promise<unknown> =>
  readBoundedJson(response, (options) => providerError('invalid-response', options));

export class PrunaImageTryOnProvider implements OutfitTryOnProvider {
  readonly modelId = PRUNA_IMAGE_TRY_ON_MODEL;
  readonly #apiKey: string;
  readonly #fetch: typeof fetch;
  readonly #timeoutMs: number;
  readonly #initialPollDelayMs: number;

  constructor(
    apiKey: string,
    options: {
      readonly fetchImplementation?: typeof fetch;
      readonly timeoutMs?: number;
      readonly pollDelayMs?: number;
    } = {},
  ) {
    this.#apiKey = apiKey;
    this.#fetch = options.fetchImplementation ?? fetch;
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.#initialPollDelayMs = options.pollDelayMs ?? INITIAL_POLL_DELAY_MS;
  }

  async tryOn(input: OutfitTryOnProviderInput): Promise<OutfitTryOnProviderResult> {
    const deadline = createProviderOperationDeadline(input.signal, this.#timeoutMs);
    try {
      return await this.#submitPollAndDownload(input, deadline.signal);
    } catch (error) {
      if (error instanceof ReferenceImageProviderError) throw error;
      if (deadline.didExpire()) throw providerError('timeout', { cause: error });
      if (input.signal?.aborted === true) throw providerError('aborted', { cause: error });
      throw providerError('connection', { cause: error });
    } finally {
      deadline.dispose();
    }
  }

  async #upload(
    image: OutfitTryOnProviderInput['person'],
    role: 'person' | 'garment',
    signal: AbortSignal,
  ): Promise<string> {
    const body = new FormData();
    const bytes = Uint8Array.from(image.bytes);
    body.append(
      'content',
      new Blob([bytes.buffer], { type: image.mimeType }),
      `wardrobe-${role}.${imageFileExtension(image.mimeType)}`,
    );
    const response = await this.#fetch(`${PRUNA_API_ORIGIN}${PRUNA_FILES_PATH}`, {
      method: 'POST',
      headers: { apikey: this.#apiKey, Accept: 'application/json' },
      body,
      redirect: 'error',
      signal,
    });
    if (!response.ok) {
      await readLimitedJson(response).catch(() => undefined);
      throw failureForHttpStatus(response.status);
    }
    const parsed = uploadResponseSchema.safeParse(await readLimitedJson(response));
    if (!parsed.success) throw providerError('invalid-response');
    return trustedProviderUrl(parsed.data.urls.get, `${PRUNA_FILES_PATH}/`).toString();
  }

  async #submitPollAndDownload(
    input: OutfitTryOnProviderInput,
    signal: AbortSignal,
  ): Promise<OutfitTryOnProviderResult> {
    const personImage = await this.#upload(input.person, 'person', signal);
    const garmentImage = await this.#upload(input.garment, 'garment', signal);
    const response = await this.#fetch(`${PRUNA_API_ORIGIN}${PRUNA_PREDICTIONS_PATH}`, {
      method: 'POST',
      headers: {
        apikey: this.#apiKey,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Model: PRUNA_IMAGE_TRY_ON_MODEL,
      },
      body: JSON.stringify({
        input: {
          person_image: personImage,
          garment_images: [garmentImage],
          turbo: false,
          output_format: 'jpg',
          output_quality: 95,
          preserve_input_size: true,
        },
      }),
      redirect: 'error',
      signal,
    });
    if (!response.ok) {
      await readLimitedJson(response).catch(() => undefined);
      throw failureForHttpStatus(response.status);
    }
    const submitted = submitResponseSchema.safeParse(await readLimitedJson(response));
    if (!submitted.success) throw providerError('invalid-response');
    const providerRequestId = submitted.data.id;
    const expectedStatusUrl = `${PRUNA_API_ORIGIN}${PRUNA_PREDICTIONS_PATH}/status/${encodeURIComponent(providerRequestId)}`;
    if (
      trustedProviderUrl(submitted.data.get_url, `${PRUNA_PREDICTIONS_PATH}/status/`).toString() !==
      expectedStatusUrl
    ) {
      throw providerError('invalid-response', { providerRequestId });
    }

    let delayMs = this.#initialPollDelayMs;
    while (true) {
      await abortableDelay(delayMs, signal);
      const poll = await this.#fetch(expectedStatusUrl, {
        headers: { apikey: this.#apiKey, Accept: 'application/json' },
        redirect: 'error',
        signal,
      });
      if (!poll.ok) {
        await readLimitedJson(poll).catch(() => undefined);
        throw failureForHttpStatus(poll.status, providerRequestId);
      }
      const status = statusResponseSchema.safeParse(await readLimitedJson(poll));
      if (!status.success) throw providerError('invalid-response', { providerRequestId });
      if (status.data.status === 'starting' || status.data.status === 'processing') {
        delayMs = Math.min(Math.ceil(delayMs * 1.5), MAX_POLL_DELAY_MS);
        continue;
      }
      if (status.data.status === 'canceled') {
        throw providerError('aborted', { providerRequestId, providerStage: 'polling' });
      }
      if (status.data.status === 'failed') {
        const privateError = status.data.error?.toLocaleLowerCase('en-US') ?? '';
        const reason = /safety|moderation|policy|nsfw/u.test(privateError)
          ? 'moderation'
          : /billing|credit|balance|payment/u.test(privateError)
            ? 'credits'
            : /quota|rate[ -]?limit|too many/u.test(privateError)
              ? 'rate-limit'
              : 'failure';
        throw providerError(reason, { providerRequestId, providerStage: 'polling' });
      }
      if (!status.data.generation_url) {
        throw providerError('invalid-response', { providerRequestId });
      }
      const delivery = trustedProviderUrl(
        status.data.generation_url,
        `${PRUNA_PREDICTIONS_PATH}/delivery/`,
      );
      const downloaded = await this.#download(delivery, providerRequestId, signal);
      return {
        ...downloaded,
        providerId: 'pruna',
        modelId: PRUNA_IMAGE_TRY_ON_MODEL,
        providerRequestId,
      };
    }
  }

  async #download(
    url: URL,
    providerRequestId: string,
    signal: AbortSignal,
  ): Promise<{ readonly bytes: Uint8Array; readonly mimeType: ReferenceImageMimeType }> {
    const response = await this.#fetch(url, {
      headers: { apikey: this.#apiKey },
      redirect: 'error',
      signal,
    });
    if (!response.ok) throw failureForHttpStatus(response.status, providerRequestId);
    const contentType = response.headers.get('content-type')?.split(';', 1)[0]?.trim();
    if (
      contentType !== 'image/jpeg' &&
      contentType !== 'image/png' &&
      contentType !== 'image/webp'
    ) {
      throw providerError('invalid-response', { providerRequestId, providerStage: 'download' });
    }
    const declaredSize = Number(response.headers.get('content-length'));
    if (Number.isFinite(declaredSize) && declaredSize > REFERENCE_IMAGE_UPLOAD_MAX_BYTES) {
      throw providerError('invalid-response', { providerRequestId, providerStage: 'download' });
    }
    if (!response.body) {
      throw providerError('invalid-response', { providerRequestId, providerStage: 'download' });
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    while (true) {
      signal.throwIfAborted();
      const chunk = await reader.read();
      if (chunk.done) break;
      received += chunk.value.byteLength;
      if (received > REFERENCE_IMAGE_UPLOAD_MAX_BYTES) {
        await reader.cancel();
        throw providerError('invalid-response', { providerRequestId, providerStage: 'download' });
      }
      chunks.push(chunk.value);
    }
    if (received === 0) {
      throw providerError('invalid-response', { providerRequestId, providerStage: 'download' });
    }
    const bytes = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { bytes, mimeType: contentType };
  }
}
