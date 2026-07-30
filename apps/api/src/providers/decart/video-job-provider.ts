import { createWriteStream } from 'node:fs';
import { openAsBlob } from 'node:fs';
import { rm } from 'node:fs/promises';
import { once } from 'node:events';
import { finished } from 'node:stream/promises';
import { z } from 'zod';
import {
  VIDEO_RESULT_MAX_BYTES,
  type VideoInputMimeType,
  type VideoTransformModelId,
  type VideoTransformRecipe,
} from '@studio/contracts';

export type DecartQueueStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface DecartVideoJobProvider {
  submit(input: {
    readonly modelId: VideoTransformModelId;
    readonly recipe: VideoTransformRecipe;
    readonly videoPath: string;
    readonly videoMimeType: VideoInputMimeType;
    readonly referenceImagePath: string | null;
    readonly referenceImageMimeType: 'image/jpeg' | 'image/png' | 'image/webp' | null;
    readonly signal: AbortSignal;
  }): Promise<{ readonly providerJobId: string; readonly status: DecartQueueStatus }>;
  status(
    providerJobId: string,
    signal: AbortSignal,
  ): Promise<{ readonly status: DecartQueueStatus }>;
  download(providerJobId: string, destinationPath: string, signal: AbortSignal): Promise<void>;
}

export type DecartVideoProviderFailureReason =
  | 'aborted'
  | 'timeout'
  | 'authentication'
  | 'billing'
  | 'quota'
  | 'policy'
  | 'rejected'
  | 'invalid-response'
  | 'result-too-large'
  | 'upstream';

export class DecartVideoProviderError extends Error {
  readonly reason: DecartVideoProviderFailureReason;
  readonly upstreamStatus?: number;

  constructor(reason: DecartVideoProviderFailureReason, upstreamStatus?: number) {
    super('Decart video request failed.');
    this.name = 'DecartVideoProviderError';
    this.reason = reason;
    if (upstreamStatus !== undefined) this.upstreamStatus = upstreamStatus;
  }
}

const jobResponseSchema = z
  .object({
    job_id: z.string().trim().min(1).max(300),
    status: z.enum(['pending', 'processing', 'completed', 'failed']),
  })
  .passthrough();

const providerReason = (status: number): DecartVideoProviderFailureReason => {
  if (status === 401) return 'authentication';
  if (status === 402) return 'billing';
  if (status === 403) return 'policy';
  if (status === 429) return 'quota';
  if (status === 400 || status === 409 || status === 415 || status === 422) return 'rejected';
  return 'upstream';
};

const safeRequestSignal = (
  caller: AbortSignal,
  timeoutMs: number,
): { readonly signal: AbortSignal; readonly timeout: AbortSignal } => {
  const timeout = AbortSignal.timeout(timeoutMs);
  return { signal: AbortSignal.any([caller, timeout]), timeout };
};

export class DecartHttpVideoJobProvider implements DecartVideoJobProvider {
  readonly #apiKey: string;
  readonly #fetch: typeof fetch;
  readonly #baseUrl: string;

  constructor(
    apiKey: string,
    fetchImplementation: typeof fetch = fetch,
    baseUrl = 'https://api.decart.ai',
  ) {
    this.#apiKey = apiKey;
    this.#fetch = fetchImplementation;
    this.#baseUrl = baseUrl.replace(/\/+$/u, '');
  }

  async #requestJson(
    url: string,
    init: RequestInit,
    callerSignal: AbortSignal,
    timeoutMs: number,
  ): Promise<z.infer<typeof jobResponseSchema>> {
    const request = safeRequestSignal(callerSignal, timeoutMs);
    try {
      const response = await this.#fetch(url, { ...init, signal: request.signal });
      if (!response.ok)
        throw new DecartVideoProviderError(providerReason(response.status), response.status);
      const parsed = jobResponseSchema.safeParse(await response.json());
      if (!parsed.success) throw new DecartVideoProviderError('invalid-response');
      return parsed.data;
    } catch (error) {
      if (error instanceof DecartVideoProviderError) throw error;
      if (callerSignal.aborted) throw new DecartVideoProviderError('aborted');
      if (request.timeout.aborted) throw new DecartVideoProviderError('timeout');
      throw new DecartVideoProviderError('upstream');
    }
  }

  async submit(input: {
    readonly modelId: VideoTransformModelId;
    readonly recipe: VideoTransformRecipe;
    readonly videoPath: string;
    readonly videoMimeType: VideoInputMimeType;
    readonly referenceImagePath: string | null;
    readonly referenceImageMimeType: 'image/jpeg' | 'image/png' | 'image/webp' | null;
    readonly signal: AbortSignal;
  }): Promise<{ readonly providerJobId: string; readonly status: DecartQueueStatus }> {
    const form = new FormData();
    const videoExtension =
      input.videoMimeType === 'video/webm'
        ? 'webm'
        : input.videoMimeType === 'video/quicktime'
          ? 'mov'
          : 'mp4';
    form.append(
      'data',
      await openAsBlob(input.videoPath, { type: input.videoMimeType }),
      `input.${videoExtension}`,
    );
    form.append('prompt', input.recipe.prompt);
    form.append('resolution', '720p');
    form.append('enhance_prompt', String(input.recipe.enhancePrompt));
    if (input.referenceImagePath && input.referenceImageMimeType) {
      const referenceExtension =
        input.referenceImageMimeType === 'image/png'
          ? 'png'
          : input.referenceImageMimeType === 'image/webp'
            ? 'webp'
            : 'jpg';
      form.append(
        'reference_image',
        await openAsBlob(input.referenceImagePath, { type: input.referenceImageMimeType }),
        `reference.${referenceExtension}`,
      );
    }
    const response = await this.#requestJson(
      `${this.#baseUrl}/v1/jobs/${input.modelId}`,
      {
        method: 'POST',
        headers: { 'X-API-KEY': this.#apiKey },
        body: form,
      },
      input.signal,
      180_000,
    );
    return { providerJobId: response.job_id, status: response.status };
  }

  async status(
    providerJobId: string,
    signal: AbortSignal,
  ): Promise<{ readonly status: DecartQueueStatus }> {
    const response = await this.#requestJson(
      `${this.#baseUrl}/v1/jobs/${encodeURIComponent(providerJobId)}`,
      { headers: { 'X-API-KEY': this.#apiKey } },
      signal,
      30_000,
    );
    return { status: response.status };
  }

  async download(
    providerJobId: string,
    destinationPath: string,
    callerSignal: AbortSignal,
  ): Promise<void> {
    const request = safeRequestSignal(callerSignal, 180_000);
    try {
      const response = await this.#fetch(
        `${this.#baseUrl}/v1/jobs/${encodeURIComponent(providerJobId)}/content`,
        { headers: { 'X-API-KEY': this.#apiKey }, signal: request.signal },
      );
      if (!response.ok || !response.body) {
        throw new DecartVideoProviderError(providerReason(response.status), response.status);
      }
      const declaredSize = Number(response.headers.get('content-length'));
      if (Number.isFinite(declaredSize) && declaredSize > VIDEO_RESULT_MAX_BYTES) {
        throw new DecartVideoProviderError('result-too-large');
      }

      const output = createWriteStream(destinationPath, { flags: 'wx', mode: 0o600 });
      let received = 0;
      try {
        const reader = response.body.getReader();
        while (true) {
          callerSignal.throwIfAborted();
          const chunk = await reader.read();
          if (chunk.done) break;
          received += chunk.value.byteLength;
          if (received > VIDEO_RESULT_MAX_BYTES) {
            await reader.cancel();
            throw new DecartVideoProviderError('result-too-large');
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
      if (error instanceof DecartVideoProviderError) throw error;
      if (callerSignal.aborted) throw new DecartVideoProviderError('aborted');
      if (request.timeout.aborted) throw new DecartVideoProviderError('timeout');
      throw new DecartVideoProviderError('upstream');
    }
  }
}
