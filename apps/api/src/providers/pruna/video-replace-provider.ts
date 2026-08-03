import { createWriteStream, openAsBlob } from 'node:fs';
import { rm } from 'node:fs/promises';
import { once } from 'node:events';
import { finished } from 'node:stream/promises';
import { z } from 'zod';
import { VIDEO_RESULT_MAX_BYTES } from '@studio/contracts';
import { PRUNA_VIDEO_REPLACE_MODEL } from '../../config/environment.js';
import { readBoundedJson } from '../transport/bounded-provider-transport.js';
import {
  type ExistingVideoJobProvider,
  VideoJobProviderError,
  type VideoJobProviderFailureReason,
  type VideoJobProviderStatus,
} from '../video-jobs/video-job-provider.js';

const PRUNA_API_ORIGIN = 'https://api.pruna.ai' as const;
const PRUNA_FILES_PATH = '/v1/files' as const;
const PRUNA_PREDICTIONS_PATH = '/v1/predictions' as const;
const DEFAULT_REPLACEMENT_INSTRUCTION =
  'Replace the person in the source video with the identity from reference image 1. Keep lip sync, motion, audio, and camera from the source video.';

const uploadResponseSchema = z
  .object({
    urls: z.object({ get: z.url() }).passthrough(),
  })
  .passthrough();

const submitResponseSchema = z
  .object({
    id: z.string().trim().min(1).max(300),
    get_url: z.url(),
  })
  .passthrough();

const statusResponseSchema = z
  .object({
    status: z.enum(['starting', 'processing', 'succeeded', 'failed', 'canceled']),
    generation_url: z.url().optional(),
    error: z.string().max(2_000).nullish(),
  })
  .passthrough();

const reasonForStatus = (status: number): VideoJobProviderFailureReason => {
  if (status === 401) return 'authentication';
  if (status === 402) return 'billing';
  if (status === 403) return 'policy';
  if (status === 429) return 'quota';
  if (status === 400 || status === 409 || status === 415 || status === 422) return 'rejected';
  return 'upstream';
};

const warnForUpstreamHttpFailure = (status: number): void => {
  console.warn('[pruna-video-replace] Upstream HTTP request failed.', { status });
};

const warnForTerminalPredictionFailure = (
  status: 'failed' | 'canceled',
  failureReason: VideoJobProviderFailureReason,
): void => {
  console.warn('[pruna-video-replace] Prediction reached a terminal state without a result.', {
    status,
    failureReason,
  });
};

const providerUrl = (candidate: string, pathPrefix: string): URL => {
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new VideoJobProviderError('invalid-response');
  }
  if (
    parsed.origin !== PRUNA_API_ORIGIN ||
    !parsed.pathname.startsWith(pathPrefix) ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new VideoJobProviderError('invalid-response');
  }
  return parsed;
};

const requestSignal = (
  caller: AbortSignal,
  timeoutMs: number,
): { readonly signal: AbortSignal; readonly timeout: AbortSignal } => {
  const timeout = AbortSignal.timeout(timeoutMs);
  return { signal: AbortSignal.any([caller, timeout]), timeout };
};

const mapStatus = (
  status: z.infer<typeof statusResponseSchema>['status'],
): VideoJobProviderStatus => {
  if (status === 'succeeded') return 'completed';
  if (status === 'failed' || status === 'canceled') return 'failed';
  if (status === 'processing') return 'processing';
  return 'pending';
};

const failureReasonForPrediction = (
  status: z.infer<typeof statusResponseSchema>['status'],
  privateError?: string | null,
): VideoJobProviderFailureReason | undefined => {
  if (status === 'canceled') return 'aborted';
  if (status !== 'failed') return undefined;
  const normalized = privateError?.toLocaleLowerCase('en-US') ?? '';
  if (/\b(?:safety|moderation|policy|nsfw)\b/u.test(normalized)) return 'policy';
  if (/\b(?:billing|credit|balance|payment)\b/u.test(normalized)) return 'billing';
  if (/\bquota\b|rate[ -]?limit|too many requests/u.test(normalized)) return 'quota';
  if (/\btimeout\b|timed out/u.test(normalized)) return 'timeout';
  if (
    /invalid (?:input|video|image|sample)|unsupported|\b(?:dimension|resolution|codec|duration)\b/u.test(
      normalized,
    )
  ) {
    return 'rejected';
  }
  return 'generation-failed';
};

export class PrunaVideoReplaceProvider implements ExistingVideoJobProvider {
  readonly #apiKey: string;
  readonly #resolution: '720p' | '1080p';
  readonly #fetch: typeof fetch;
  readonly #timeouts: Readonly<{ uploadMs: number; statusMs: number; downloadMs: number }>;

  constructor(
    apiKey: string,
    resolution: '720p' | '1080p',
    fetchImplementation: typeof fetch = fetch,
    timeouts: Readonly<{ uploadMs: number; statusMs: number; downloadMs: number }> = {
      uploadMs: 180_000,
      statusMs: 30_000,
      downloadMs: 180_000,
    },
  ) {
    this.#apiKey = apiKey;
    this.#resolution = resolution;
    this.#fetch = fetchImplementation;
    this.#timeouts = timeouts;
  }

  async #json(
    url: string,
    init: RequestInit,
    callerSignal: AbortSignal,
    timeoutMs: number,
  ): Promise<unknown> {
    const request = requestSignal(callerSignal, timeoutMs);
    try {
      const response = await this.#fetch(url, { ...init, signal: request.signal });
      if (!response.ok) {
        warnForUpstreamHttpFailure(response.status);
        throw new VideoJobProviderError(reasonForStatus(response.status), response.status);
      }
      return await readBoundedJson(
        response,
        () => new VideoJobProviderError('invalid-response', response.status),
        () => new VideoJobProviderError('invalid-response', response.status),
        request.signal,
      );
    } catch (error) {
      if (error instanceof VideoJobProviderError) throw error;
      if (callerSignal.aborted) throw new VideoJobProviderError('aborted');
      if (request.timeout.aborted) throw new VideoJobProviderError('timeout');
      throw new VideoJobProviderError('upstream');
    }
  }

  async #upload(
    filePath: string,
    mimeType: 'video/mp4' | 'image/jpeg' | 'image/png' | 'image/webp',
    fileName: string,
    signal: AbortSignal,
  ): Promise<string> {
    const form = new FormData();
    form.append('content', await openAsBlob(filePath, { type: mimeType }), fileName);
    const payload = await this.#json(
      `${PRUNA_API_ORIGIN}${PRUNA_FILES_PATH}`,
      { method: 'POST', headers: { apikey: this.#apiKey }, body: form },
      signal,
      this.#timeouts.uploadMs,
    );
    const parsed = uploadResponseSchema.safeParse(payload);
    if (!parsed.success) throw new VideoJobProviderError('invalid-response');
    return providerUrl(parsed.data.urls.get, `${PRUNA_FILES_PATH}/`).toString();
  }

  async submit(input: Parameters<ExistingVideoJobProvider['submit']>[0]): Promise<{
    readonly providerJobId: string;
    readonly status: VideoJobProviderStatus;
  }> {
    if (
      input.operation !== 'character-swap' ||
      input.videoMimeType !== 'video/mp4' ||
      !input.referenceImagePath ||
      !input.referenceImageMimeType
    ) {
      throw new VideoJobProviderError('rejected');
    }
    const videoUrl = await this.#upload(
      input.videoPath,
      'video/mp4',
      'character-swap-source.mp4',
      input.signal,
    );
    const referenceExtension =
      input.referenceImageMimeType === 'image/png'
        ? 'png'
        : input.referenceImageMimeType === 'image/webp'
          ? 'webp'
          : 'jpg';
    const referenceUrl = await this.#upload(
      input.referenceImagePath,
      input.referenceImageMimeType,
      `character-swap-reference.${referenceExtension}`,
      input.signal,
    );
    const payload = await this.#json(
      `${PRUNA_API_ORIGIN}${PRUNA_PREDICTIONS_PATH}`,
      {
        method: 'POST',
        headers: {
          apikey: this.#apiKey,
          'Content-Type': 'application/json',
          Model: PRUNA_VIDEO_REPLACE_MODEL,
        },
        body: JSON.stringify({
          input: {
            video: videoUrl,
            images: [referenceUrl],
            instruction_prompt: input.recipe.prompt || DEFAULT_REPLACEMENT_INSTRUCTION,
            resolution: this.#resolution,
            save_audio: true,
          },
        }),
      },
      input.signal,
      this.#timeouts.uploadMs,
    );
    const parsed = submitResponseSchema.safeParse(payload);
    if (!parsed.success) throw new VideoJobProviderError('invalid-response');
    const expectedStatusUrl = `${PRUNA_API_ORIGIN}${PRUNA_PREDICTIONS_PATH}/status/${encodeURIComponent(parsed.data.id)}`;
    if (
      providerUrl(parsed.data.get_url, `${PRUNA_PREDICTIONS_PATH}/status/`).toString() !==
      expectedStatusUrl
    ) {
      throw new VideoJobProviderError('invalid-response');
    }
    return { providerJobId: parsed.data.id, status: 'pending' };
  }

  async status(
    providerJobId: string,
    signal: AbortSignal,
  ): Promise<{
    readonly status: VideoJobProviderStatus;
    readonly outputLocation?: string;
    readonly failureReason?: VideoJobProviderFailureReason;
  }> {
    const payload = await this.#json(
      `${PRUNA_API_ORIGIN}${PRUNA_PREDICTIONS_PATH}/status/${encodeURIComponent(providerJobId)}`,
      { headers: { apikey: this.#apiKey } },
      signal,
      this.#timeouts.statusMs,
    );
    const parsed = statusResponseSchema.safeParse(payload);
    if (!parsed.success) throw new VideoJobProviderError('invalid-response');
    if (parsed.data.status === 'succeeded') {
      if (!parsed.data.generation_url) throw new VideoJobProviderError('invalid-response');
      return {
        status: 'completed',
        outputLocation: providerUrl(
          parsed.data.generation_url,
          `${PRUNA_PREDICTIONS_PATH}/delivery/`,
        ).toString(),
      };
    }
    const failureReason = failureReasonForPrediction(parsed.data.status, parsed.data.error);
    if (
      failureReason !== undefined &&
      (parsed.data.status === 'failed' || parsed.data.status === 'canceled')
    ) {
      warnForTerminalPredictionFailure(parsed.data.status, failureReason);
    }
    return {
      status: mapStatus(parsed.data.status),
      ...(failureReason === undefined ? {} : { failureReason }),
    };
  }

  async download(
    _providerJobId: string,
    destinationPath: string,
    signal: AbortSignal,
    outputLocation?: string | null,
  ): Promise<void> {
    if (!outputLocation) throw new VideoJobProviderError('invalid-response');
    const url = providerUrl(outputLocation, `${PRUNA_PREDICTIONS_PATH}/delivery/`);
    const request = requestSignal(signal, this.#timeouts.downloadMs);
    try {
      const response = await this.#fetch(url, {
        headers: { apikey: this.#apiKey },
        signal: request.signal,
      });
      if (!response.ok) {
        warnForUpstreamHttpFailure(response.status);
        throw new VideoJobProviderError(reasonForStatus(response.status), response.status);
      }
      if (!response.body) throw new VideoJobProviderError('invalid-response', response.status);
      if (response.headers.get('content-type')?.split(';', 1)[0]?.trim() !== 'video/mp4') {
        throw new VideoJobProviderError('invalid-response', response.status);
      }
      const declaredSize = Number(response.headers.get('content-length'));
      if (Number.isFinite(declaredSize) && declaredSize > VIDEO_RESULT_MAX_BYTES) {
        throw new VideoJobProviderError('result-too-large');
      }
      const output = createWriteStream(destinationPath, { flags: 'wx', mode: 0o600 });
      let received = 0;
      try {
        const reader = response.body.getReader();
        while (true) {
          signal.throwIfAborted();
          const chunk = await reader.read();
          if (chunk.done) break;
          received += chunk.value.byteLength;
          if (received > VIDEO_RESULT_MAX_BYTES) {
            await reader.cancel();
            throw new VideoJobProviderError('result-too-large');
          }
          if (!output.write(chunk.value)) await once(output, 'drain');
        }
        output.end();
        await finished(output);
      } catch (error) {
        output.destroy();
        throw error;
      }
    } catch (error) {
      await rm(destinationPath, { force: true }).catch(() => undefined);
      if (error instanceof VideoJobProviderError) throw error;
      if (signal.aborted) throw new VideoJobProviderError('aborted');
      if (request.timeout.aborted) throw new VideoJobProviderError('timeout');
      throw new VideoJobProviderError('upstream');
    }
  }
}
