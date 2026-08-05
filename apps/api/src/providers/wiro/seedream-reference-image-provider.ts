import { createHmac, randomInt } from 'node:crypto';
import { z } from 'zod';
import { referenceImageMimeTypeSchema } from '@studio/contracts';
import { imageFileExtension } from '@studio/domain';
import {
  type EditReferenceImageProviderInput,
  type GenerateReferenceImageProviderInput,
  type GeneratedReferenceImagePayload,
  type ReferenceImageProvider,
  ReferenceImageProviderError,
} from '../reference-images/reference-image-provider.js';
import {
  abortableDelay,
  createProviderOperationDeadline,
  readBoundedJson,
} from '../transport/bounded-provider-transport.js';
import { normalizeWiroImage } from './normalize-image.js';
import { SafeWiroImageDownloader } from './safe-image-downloader.js';
import type { DownloadedRemoteImage } from '../transport/safe-remote-image-downloader.js';
import { nextProviderPollDelayMs } from '../transport/provider-polling.js';

export const WIRO_SEEDREAM_MODEL = 'seedream-v5-lite-uncensored' as const;
export const WIRO_SEEDREAM_OWNER = 'ByteDance' as const;
export const WIRO_SEEDREAM_RUN_ENDPOINT =
  'https://api.wiro.ai/v1/Run/ByteDance/seedream-v5-lite-uncensored';
export const WIRO_TASK_DETAIL_ENDPOINT = 'https://api.wiro.ai/v1/Task/Detail';
export const WIRO_TASK_DELETE_ENDPOINT = 'https://api.wiro.ai/v1/Task/InputOutputDelete';
export const WIRO_REFERENCE_IMAGE_TIMEOUT_MS = 180_000;

const WIRO_CLEANUP_TIMEOUT_MS = 10_000;
const INITIAL_POLL_DELAY_MS = 1_000;
const MAX_POLL_DELAY_MS = 5_000;
const MAX_CONSECUTIVE_POLL_FAILURES = 3;

const wiroErrorsSchema = z.array(z.unknown()).max(50);

const submitResponseSchema = z.object({
  result: z.literal(true),
  errors: wiroErrorsSchema,
  taskid: z.string().trim().min(1).max(500),
  socketaccesstoken: z.string().trim().min(1).max(500),
});

const outputSchema = z.object({
  name: z.string().max(1_000).optional(),
  contenttype: referenceImageMimeTypeSchema,
  size: z.string().regex(/^\d+$/u).optional(),
  url: z.url(),
});

const taskSchema = z.object({
  id: z.string().trim().min(1).max(500),
  status: z.string().trim().min(1).max(100),
  pexit: z.string().trim().max(20).nullable().optional(),
  totalcost: z.string().trim().max(100).nullable().optional(),
  modelslugowner: z.string().trim().max(128).optional(),
  modelslugproject: z.string().trim().max(128).optional(),
  outputs: z.array(outputSchema).max(15).optional(),
});

const detailResponseSchema = z.object({
  result: z.literal(true),
  errors: wiroErrorsSchema,
  tasklist: z.array(taskSchema).length(1),
});

const deleteResponseSchema = z.object({
  result: z.literal(true),
  errors: wiroErrorsSchema,
});

const failedEnvelopeSchema = z.object({
  result: z.literal(false),
  errors: wiroErrorsSchema,
});

type WiroProviderStage = 'submission' | 'polling' | 'download';

export interface WiroLifecycleEvent {
  readonly providerId: 'wiro';
  readonly modelId: typeof WIRO_SEEDREAM_MODEL;
  readonly stage:
    | 'submitted'
    | 'downloading'
    | 'normalized'
    | 'cleanup_started'
    | 'cleanup_succeeded'
    | 'cleanup_failed'
    | 'failed';
  readonly providerRequestId: string;
  readonly status?: string;
  readonly deliveryOrigin?: string;
}

export type WiroLifecycleObserver = (event: WiroLifecycleEvent) => void;
type WiroLifecycleDetails = Pick<WiroLifecycleEvent, 'status' | 'deliveryOrigin'>;

const providerError = (
  reason: ConstructorParameters<typeof ReferenceImageProviderError>[0],
  options: Omit<
    NonNullable<ConstructorParameters<typeof ReferenceImageProviderError>[1]>,
    'providerId'
  > = {},
): ReferenceImageProviderError =>
  new ReferenceImageProviderError(reason, { providerId: 'wiro', ...options });

const readLimitedJson = (response: Response): Promise<unknown> =>
  readBoundedJson(response, (options) => providerError('invalid-response', options));

const errorText = (errors: readonly unknown[]): string =>
  errors
    .flatMap((error) => {
      if (typeof error === 'string') return [error];
      if (typeof error !== 'object' || error === null) return [];
      return Object.values(error).filter((value): value is string => typeof value === 'string');
    })
    .join(' ')
    .toLowerCase();

const failureForErrorText = (
  errors: readonly unknown[],
  providerRequestId?: string,
): ReferenceImageProviderError => {
  const text = errorText(errors);
  const options = providerRequestId === undefined ? {} : { providerRequestId };
  if (/signature|api.?key|unauthori[sz]ed|forbidden|credential/u.test(text)) {
    return providerError('authentication', options);
  }
  if (/balance|credit|payment|billing|fund/u.test(text)) {
    return providerError('credits', options);
  }
  if (/concurren|rate.?limit|too many/u.test(text)) {
    return providerError('rate-limit', options);
  }
  if (/invalid|parameter|required|validation/u.test(text)) {
    return providerError('invalid-request', options);
  }
  return providerError('failure', options);
};

const failureForHttpStatus = (
  status: number,
  providerRequestId?: string,
): ReferenceImageProviderError => {
  const options = {
    upstreamStatus: status,
    ...(providerRequestId === undefined ? {} : { providerRequestId }),
  };
  if (status === 400 || status === 404 || status === 422) {
    return providerError('invalid-request', options);
  }
  if (status === 401 || status === 403) return providerError('authentication', options);
  if (status === 402) return providerError('credits', options);
  if (status === 409 || status === 429) return providerError('rate-limit', options);
  return providerError('failure', options);
};

const connectionError = (
  error: unknown,
  providerStage: WiroProviderStage,
  providerRequestId?: string,
): ReferenceImageProviderError =>
  providerError('connection', {
    providerStage,
    ...(providerRequestId === undefined ? {} : { providerRequestId }),
    cause: error,
  });

const aspectRatioForSize = (
  size: GenerateReferenceImageProviderInput['size'],
): '1:1' | '2:3' | '3:2' => {
  switch (size) {
    case '1024x1024':
      return '1:1';
    case '1024x1536':
      return '2:3';
    case '1536x1024':
      return '3:2';
  }
};

const parseCost = (value: string | null | undefined): number | undefined => {
  if (value === undefined || value === null || !/^\d+(?:\.\d+)?$/u.test(value)) return undefined;
  const cost = Number(value);
  return Number.isFinite(cost) && cost >= 0 ? cost : undefined;
};

export class WiroSeedreamReferenceImageProvider implements ReferenceImageProvider {
  readonly descriptor;
  readonly #apiKey: string;
  readonly #apiSecret: string;
  readonly #fetch: typeof fetch;
  readonly #downloader: Pick<SafeWiroImageDownloader, 'download'>;
  readonly #timeoutMs: number;
  readonly #pollDelayMs: number;
  readonly #createNonce: () => string;
  readonly #observeLifecycle: WiroLifecycleObserver | undefined;

  constructor(
    apiKey: string,
    apiSecret: string,
    options: {
      readonly model?: typeof WIRO_SEEDREAM_MODEL;
      readonly timeoutMs?: number;
      readonly fetchImplementation?: typeof fetch;
      readonly downloader?: Pick<SafeWiroImageDownloader, 'download'>;
      readonly pollDelayMs?: number;
      readonly createNonce?: () => string;
      readonly observeLifecycle?: WiroLifecycleObserver;
    } = {},
  ) {
    const model = options.model ?? WIRO_SEEDREAM_MODEL;
    this.#apiKey = apiKey;
    this.#apiSecret = apiSecret;
    this.#fetch = options.fetchImplementation ?? fetch;
    this.#downloader = options.downloader ?? new SafeWiroImageDownloader();
    this.#timeoutMs = options.timeoutMs ?? WIRO_REFERENCE_IMAGE_TIMEOUT_MS;
    this.#pollDelayMs = options.pollDelayMs ?? INITIAL_POLL_DELAY_MS;
    this.#createNonce =
      options.createNonce ?? (() => `${Date.now()}${randomInt(100_000, 1_000_000)}`);
    this.#observeLifecycle = options.observeLifecycle;
    this.descriptor = {
      providerId: 'wiro' as const,
      modelId: model,
      adapterVersion: 'wiro-seedream-v5-lite-v1',
      effectiveSettings: {
        owner: WIRO_SEEDREAM_OWNER,
        resolution: '2k',
        maxImages: 1,
        watermark: false,
      },
    };
  }

  generate(input: GenerateReferenceImageProviderInput): Promise<GeneratedReferenceImagePayload> {
    return this.#run(input);
  }

  edit(input: EditReferenceImageProviderInput): Promise<GeneratedReferenceImagePayload> {
    const body = new FormData();
    const sourceBytes = Uint8Array.from(input.source.bytes);
    body.append(
      'inputImage',
      new Blob([sourceBytes.buffer], { type: input.source.mimeType }),
      `reference.${imageFileExtension(input.source.mimeType)}`,
    );
    this.#appendParameters(body, input);
    return this.#run(input, body);
  }

  #appendParameters(body: FormData, input: GenerateReferenceImageProviderInput): void {
    body.append('prompt', input.prompt);
    body.append('resolution', '2k');
    body.append('aspectRatio', aspectRatioForSize(input.size));
    body.append('maxImages', '1');
    body.append('watermark', 'false');
  }

  async #run(
    input: GenerateReferenceImageProviderInput,
    multipartBody?: FormData,
  ): Promise<GeneratedReferenceImagePayload> {
    const deadline = createProviderOperationDeadline(input.signal, this.#timeoutMs);
    let cleanupAcceptedTask: (() => Promise<void>) | undefined;

    try {
      return await this.#submitPollDownloadAndNormalize(
        input,
        multipartBody,
        deadline.signal,
        (taskId, taskToken) => {
          cleanupAcceptedTask = () => this.#cleanupRemoteArtifacts(taskId, taskToken);
        },
      );
    } catch (error) {
      await cleanupAcceptedTask?.();
      if (error instanceof ReferenceImageProviderError) throw error;
      if (deadline.didExpire()) throw providerError('timeout', { cause: error });
      if (input.signal?.aborted === true) throw providerError('aborted', { cause: error });
      throw providerError('connection', { cause: error });
    } finally {
      deadline.dispose();
    }
  }

  async #submitPollDownloadAndNormalize(
    input: GenerateReferenceImageProviderInput,
    multipartBody: FormData | undefined,
    signal: AbortSignal,
    onTaskAccepted: (taskId: string, taskToken: string) => void,
  ): Promise<GeneratedReferenceImagePayload> {
    let response: Response;
    try {
      response = await this.#fetch(WIRO_SEEDREAM_RUN_ENDPOINT, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          ...this.#authenticationHeaders(),
          ...(multipartBody === undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body:
          multipartBody ??
          JSON.stringify({
            prompt: input.prompt,
            resolution: '2k',
            aspectRatio: aspectRatioForSize(input.size),
            maxImages: 1,
            watermark: 'false',
          }),
        redirect: 'error',
        signal,
      });
    } catch (error) {
      if (signal.aborted) throw error;
      throw connectionError(error, 'submission');
    }
    const submittedBody = await readLimitedJson(response).catch((error: unknown) => {
      if (!response.ok) return undefined;
      throw error;
    });
    if (!response.ok) {
      throw failureForHttpStatus(response.status);
    }
    const submitted = submitResponseSchema.safeParse(submittedBody);
    if (!submitted.success) {
      const failed = failedEnvelopeSchema.safeParse(submittedBody);
      if (failed.success) throw failureForErrorText(failed.data.errors);
      throw providerError('invalid-response');
    }

    const taskId = submitted.data.taskid;
    const taskToken = submitted.data.socketaccesstoken;
    onTaskAccepted(taskId, taskToken);
    this.#observe('submitted', taskId);

    let delayMs = this.#pollDelayMs;
    let consecutivePollFailures = 0;
    while (true) {
      await abortableDelay(delayMs, signal);
      let poll: Response;
      try {
        poll = await this.#fetch(WIRO_TASK_DETAIL_ENDPOINT, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            ...this.#authenticationHeaders(),
          },
          body: JSON.stringify({ tasktoken: taskToken }),
          redirect: 'error',
          signal,
        });
      } catch (error) {
        if (signal.aborted) throw error;
        throw connectionError(error, 'polling', taskId);
      }
      const pollBody = await readLimitedJson(poll).catch((error: unknown) => {
        if (!poll.ok) return undefined;
        throw error;
      });
      if (!poll.ok) {
        if (poll.status === 409 || poll.status === 429 || poll.status >= 500) {
          consecutivePollFailures += 1;
          if (consecutivePollFailures > MAX_CONSECUTIVE_POLL_FAILURES) {
            throw failureForHttpStatus(poll.status, taskId);
          }
          delayMs = nextProviderPollDelayMs(
            delayMs,
            MAX_POLL_DELAY_MS,
            poll.headers.get('retry-after'),
            1,
          );
          continue;
        }
        throw failureForHttpStatus(poll.status, taskId);
      }
      consecutivePollFailures = 0;
      const parsed = detailResponseSchema.safeParse(pollBody);
      if (!parsed.success) {
        const failed = failedEnvelopeSchema.safeParse(pollBody);
        if (failed.success) throw failureForErrorText(failed.data.errors, taskId);
        throw providerError('invalid-response', { providerRequestId: taskId });
      }
      const task = parsed.data.tasklist[0];
      if (task === undefined) {
        throw providerError('invalid-response', { providerRequestId: taskId });
      }
      if (
        task.id !== taskId ||
        (task.modelslugowner !== undefined &&
          task.modelslugowner.toLowerCase() !== WIRO_SEEDREAM_OWNER.toLowerCase()) ||
        (task.modelslugproject !== undefined && task.modelslugproject !== WIRO_SEEDREAM_MODEL)
      ) {
        throw providerError('invalid-response', { providerRequestId: taskId });
      }
      if (task.status === 'task_cancel') {
        this.#observe('failed', taskId, { status: task.status });
        throw providerError('failure', { providerRequestId: taskId });
      }
      if (task.status !== 'task_postprocess_end') {
        delayMs = nextProviderPollDelayMs(delayMs, MAX_POLL_DELAY_MS, null, 1);
        continue;
      }
      if (task.pexit !== '0') {
        this.#observe('failed', taskId, { status: task.status });
        throw providerError('failure', { providerRequestId: taskId });
      }
      if (task.outputs?.length !== 1) {
        throw providerError('invalid-response', { providerRequestId: taskId });
      }

      const output = task.outputs[0];
      if (output === undefined) {
        throw providerError('invalid-response', { providerRequestId: taskId });
      }
      const deliveryUrl = new URL(output.url);
      this.#observe('downloading', taskId, {
        deliveryOrigin: deliveryUrl.origin,
        status: task.status,
      });
      let downloaded: DownloadedRemoteImage;
      try {
        downloaded = await this.#downloader.download(output.url, signal);
      } catch (error) {
        if (signal.aborted && !(error instanceof ReferenceImageProviderError)) throw error;
        if (error instanceof ReferenceImageProviderError) {
          throw providerError(error.reason, {
            providerRequestId: taskId,
            providerStage: 'download',
            ...(error.upstreamStatus === undefined ? {} : { upstreamStatus: error.upstreamStatus }),
            cause: error,
          });
        }
        throw connectionError(error, 'download', taskId);
      }
      if (downloaded.mimeType !== output.contenttype) {
        throw providerError('invalid-response', {
          providerRequestId: taskId,
          providerStage: 'download',
        });
      }
      let normalized;
      try {
        normalized = await normalizeWiroImage(downloaded.bytes, input.size, input.format);
      } catch (error) {
        if (error instanceof ReferenceImageProviderError) {
          throw providerError(error.reason, {
            providerRequestId: taskId,
            providerStage: 'download',
            cause: error,
          });
        }
        throw connectionError(error, 'download', taskId);
      }
      this.#observe('normalized', taskId, { status: task.status });
      const cost = parseCost(task.totalcost);
      return {
        bytes: normalized.bytes,
        mimeType: normalized.mimeType,
        providerId: 'wiro',
        modelId: WIRO_SEEDREAM_MODEL,
        providerRequestId: taskId,
        ...(cost === undefined ? {} : { safeUsage: { cost } }),
        cleanupRemoteArtifacts: () => this.#cleanupRemoteArtifacts(taskId, taskToken),
      };
    }
  }

  #authenticationHeaders(): {
    readonly 'x-api-key': string;
    readonly 'x-signature': string;
    readonly 'x-nonce': string;
  } {
    const nonce = this.#createNonce();
    const signature = createHmac('sha256', this.#apiKey)
      .update(`${this.#apiSecret}${nonce}`, 'utf8')
      .digest('hex');
    return {
      'x-api-key': this.#apiKey,
      'x-signature': signature,
      'x-nonce': nonce,
    };
  }

  #observe(
    stage: WiroLifecycleEvent['stage'],
    providerRequestId: string,
    details: WiroLifecycleDetails = {},
  ): void {
    this.#observeLifecycle?.({
      providerId: 'wiro',
      modelId: WIRO_SEEDREAM_MODEL,
      stage,
      providerRequestId,
      ...details,
    });
  }

  async #cleanupRemoteArtifacts(taskId: string, taskToken: string): Promise<void> {
    this.#observe('cleanup_started', taskId);
    try {
      const response = await this.#fetch(WIRO_TASK_DELETE_ENDPOINT, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...this.#authenticationHeaders(),
        },
        body: JSON.stringify({ tasktoken: taskToken }),
        redirect: 'error',
        signal: AbortSignal.timeout(WIRO_CLEANUP_TIMEOUT_MS),
      });
      const body = await readLimitedJson(response);
      if (!response.ok || !deleteResponseSchema.safeParse(body).success) {
        throw providerError('failure', {
          providerRequestId: taskId,
          upstreamStatus: response.status,
        });
      }
      this.#observe('cleanup_succeeded', taskId);
    } catch {
      this.#observe('cleanup_failed', taskId);
    }
  }
}
