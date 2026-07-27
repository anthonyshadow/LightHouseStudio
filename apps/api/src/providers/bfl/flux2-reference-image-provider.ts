import { z } from 'zod';
import {
  dimensionsForReferenceImageSize,
  type EditReferenceImageProviderInput,
  type GenerateReferenceImageProviderInput,
  type GeneratedReferenceImagePayload,
  type ReferenceImageProvider,
  ReferenceImageProviderError,
} from '../reference-images/reference-image-provider.js';
import { SafeBflImageDownloader, type DownloadedProviderImage } from './safe-image-downloader.js';

export const BFL_FLUX_2_PRO_MODEL = 'flux-2-pro' as const;
export const BFL_FLUX_2_PRO_ENDPOINT = 'https://api.us2.bfl.ai/v1/flux-2-pro';
export const BFL_REFERENCE_IMAGE_TIMEOUT_MS = 150_000;
const BFL_API_HOSTNAME_PATTERN = /^api(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*\.bfl\.ai$/u;
const MAX_BFL_JSON_BYTES = 1024 * 1024;
const INITIAL_POLL_DELAY_MS = 500;
const MAX_POLL_DELAY_MS = 5_000;
const MAX_CONSECUTIVE_POLL_FAILURES = 3;

const submitResponseSchema = z
  .object({
    id: z.string().trim().min(1).max(500),
    polling_url: z.url(),
    cost: z.number().finite().nonnegative().nullable().optional(),
    input_mp: z.number().finite().nonnegative().nullable().optional(),
    output_mp: z.number().finite().nonnegative().nullable().optional(),
  })
  .passthrough();

const pollResponseSchema = z
  .object({
    status: z.string().trim().min(1).max(100),
    result: z
      .object({
        sample: z.url(),
      })
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough();

type BflSubmitResponse = z.infer<typeof submitResponseSchema>;

export interface BflLifecycleEvent {
  readonly providerId: 'bfl';
  readonly modelId: typeof BFL_FLUX_2_PRO_MODEL;
  readonly stage: 'submitted' | 'downloading' | 'ready' | 'failed';
  readonly providerRequestId: string;
  readonly pollingOrigin?: string;
  readonly deliveryOrigin?: string;
  readonly status?: string;
}

export type BflLifecycleObserver = (event: BflLifecycleEvent) => void;

const providerError = (
  reason: ConstructorParameters<typeof ReferenceImageProviderError>[0],
  options: Omit<
    NonNullable<ConstructorParameters<typeof ReferenceImageProviderError>[1]>,
    'providerId'
  > = {},
): ReferenceImageProviderError =>
  new ReferenceImageProviderError(reason, { providerId: 'bfl', ...options });

const readLimitedJson = async (response: Response): Promise<unknown> => {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BFL_JSON_BYTES) {
    throw providerError('invalid-response', { upstreamStatus: response.status });
  }
  if (response.body === null) throw providerError('invalid-response');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    byteLength += next.value.byteLength;
    if (byteLength > MAX_BFL_JSON_BYTES) {
      await reader.cancel();
      throw providerError('invalid-response', { upstreamStatus: response.status });
    }
    chunks.push(next.value);
  }
  try {
    const bytes = Buffer.concat(chunks, byteLength);
    return JSON.parse(bytes.toString('utf8')) as unknown;
  } catch (error) {
    throw providerError('invalid-response', { upstreamStatus: response.status, cause: error });
  }
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
  if (status === 429) return providerError('rate-limit', options);
  return providerError('failure', options);
};

const abortableDelay = (milliseconds: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, milliseconds);
    signal.addEventListener('abort', onAbort, { once: true });
  });

const safeUsage = (response: BflSubmitResponse): Readonly<Record<string, number>> | undefined => {
  const usage = {
    ...(response.cost == null ? {} : { cost: response.cost }),
    ...(response.input_mp == null ? {} : { inputMegapixels: response.input_mp }),
    ...(response.output_mp == null ? {} : { outputMegapixels: response.output_mp }),
  };
  return Object.keys(usage).length === 0 ? undefined : usage;
};

const isTrustedBflPollingUrl = (url: URL): boolean =>
  url.protocol === 'https:' &&
  url.port === '' &&
  BFL_API_HOSTNAME_PATTERN.test(url.hostname) &&
  url.username === '' &&
  url.password === '' &&
  url.hash === '';

const connectionError = (
  error: unknown,
  providerStage: 'submission' | 'polling' | 'download',
  providerRequestId?: string,
): ReferenceImageProviderError =>
  providerError('connection', {
    providerStage,
    ...(providerRequestId === undefined ? {} : { providerRequestId }),
    cause: error,
  });

export class BflFlux2ReferenceImageProvider implements ReferenceImageProvider {
  readonly descriptor;
  readonly #apiKey: string;
  readonly #fetch: typeof fetch;
  readonly #downloader: Pick<SafeBflImageDownloader, 'download'>;
  readonly #timeoutMs: number;
  readonly #safetyTolerance: number;
  readonly #disablePromptUpsampling: boolean;
  readonly #initialPollDelayMs: number;
  readonly #observeLifecycle: BflLifecycleObserver | undefined;

  constructor(
    apiKey: string,
    options: {
      readonly model?: typeof BFL_FLUX_2_PRO_MODEL;
      readonly timeoutMs?: number;
      readonly safetyTolerance?: number;
      readonly disablePromptUpsampling?: boolean;
      readonly fetchImplementation?: typeof fetch;
      readonly downloader?: Pick<SafeBflImageDownloader, 'download'>;
      readonly observeLifecycle?: BflLifecycleObserver;
      readonly pollDelayMs?: number;
    } = {},
  ) {
    const model = options.model ?? BFL_FLUX_2_PRO_MODEL;
    this.#apiKey = apiKey;
    this.#fetch = options.fetchImplementation ?? fetch;
    this.#downloader = options.downloader ?? new SafeBflImageDownloader();
    this.#timeoutMs = options.timeoutMs ?? BFL_REFERENCE_IMAGE_TIMEOUT_MS;
    this.#safetyTolerance = options.safetyTolerance ?? 4;
    this.#disablePromptUpsampling = options.disablePromptUpsampling ?? true;
    this.#initialPollDelayMs = options.pollDelayMs ?? INITIAL_POLL_DELAY_MS;
    this.#observeLifecycle = options.observeLifecycle;
    this.descriptor = {
      providerId: 'bfl' as const,
      modelId: model,
      adapterVersion: 'bfl-flux-2-pro-v1',
      effectiveSettings: {
        safetyTolerance: this.#safetyTolerance,
        disablePromptUpsampling: this.#disablePromptUpsampling,
      },
    };
  }

  generate(input: GenerateReferenceImageProviderInput): Promise<GeneratedReferenceImagePayload> {
    return this.#run(input);
  }

  edit(input: EditReferenceImageProviderInput): Promise<GeneratedReferenceImagePayload> {
    return this.#run(input, Buffer.from(input.source.bytes).toString('base64'));
  }

  async #run(
    input: GenerateReferenceImageProviderInput,
    inputImage?: string,
  ): Promise<GeneratedReferenceImagePayload> {
    const deadlineController = new AbortController();
    let deadlineExpired = false;
    const onCallerAbort = () => deadlineController.abort(input.signal?.reason);
    input.signal?.addEventListener('abort', onCallerAbort, { once: true });
    if (input.signal?.aborted === true) deadlineController.abort(input.signal.reason);
    const deadlineTimer = setTimeout(() => {
      deadlineExpired = true;
      deadlineController.abort();
    }, this.#timeoutMs);

    try {
      return await this.#submitPollAndDownload(input, inputImage, deadlineController.signal);
    } catch (error) {
      if (error instanceof ReferenceImageProviderError) throw error;
      if (deadlineExpired) throw providerError('timeout', { cause: error });
      if (input.signal?.aborted === true) throw providerError('aborted', { cause: error });
      throw providerError('connection', { cause: error });
    } finally {
      clearTimeout(deadlineTimer);
      input.signal?.removeEventListener('abort', onCallerAbort);
    }
  }

  async #submitPollAndDownload(
    input: GenerateReferenceImageProviderInput,
    inputImage: string | undefined,
    signal: AbortSignal,
  ): Promise<GeneratedReferenceImagePayload> {
    const { width, height } = dimensionsForReferenceImageSize(input.size);
    let response: Response;
    try {
      response = await this.#fetch(BFL_FLUX_2_PRO_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'x-key': this.#apiKey,
        },
        body: JSON.stringify({
          prompt: input.prompt,
          width,
          height,
          output_format: input.format,
          safety_tolerance: this.#safetyTolerance,
          disable_pup: this.#disablePromptUpsampling,
          ...(inputImage === undefined ? {} : { input_image: inputImage }),
        }),
        redirect: 'error',
        signal,
      });
    } catch (error) {
      if (signal.aborted) throw error;
      throw connectionError(error, 'submission');
    }
    if (!response.ok) {
      await readLimitedJson(response).catch(() => undefined);
      throw failureForHttpStatus(response.status);
    }
    const submitted = submitResponseSchema.safeParse(await readLimitedJson(response));
    if (!submitted.success) throw providerError('invalid-response');
    const pollingUrl = new URL(submitted.data.polling_url);
    if (!isTrustedBflPollingUrl(pollingUrl)) {
      throw providerError('invalid-response', { providerRequestId: submitted.data.id });
    }

    const taskId = submitted.data.id;
    this.#observeLifecycle?.({
      providerId: 'bfl',
      modelId: BFL_FLUX_2_PRO_MODEL,
      stage: 'submitted',
      providerRequestId: taskId,
      pollingOrigin: pollingUrl.origin,
    });

    let delayMs = this.#initialPollDelayMs;
    let consecutivePollFailures = 0;
    while (true) {
      await abortableDelay(delayMs, signal);
      let poll: Response;
      try {
        poll = await this.#fetch(submitted.data.polling_url, {
          method: 'GET',
          headers: { Accept: 'application/json', 'x-key': this.#apiKey },
          redirect: 'error',
          signal,
        });
      } catch (error) {
        if (signal.aborted) throw error;
        throw connectionError(error, 'polling', taskId);
      }
      if (!poll.ok) {
        await readLimitedJson(poll).catch(() => undefined);
        if (poll.status === 429 || poll.status >= 500) {
          consecutivePollFailures += 1;
          if (consecutivePollFailures > MAX_CONSECUTIVE_POLL_FAILURES) {
            throw failureForHttpStatus(poll.status, taskId);
          }
          const retryAfterSeconds = Number(poll.headers.get('retry-after'));
          const retryAfterMs =
            Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0
              ? Math.min(retryAfterSeconds * 1_000, MAX_POLL_DELAY_MS)
              : 0;
          delayMs = Math.min(Math.ceil(delayMs * 1.5), MAX_POLL_DELAY_MS);
          delayMs = Math.max(delayMs, retryAfterMs);
          continue;
        }
        throw failureForHttpStatus(poll.status, taskId);
      }
      consecutivePollFailures = 0;
      const parsed = pollResponseSchema.safeParse(await readLimitedJson(poll));
      if (!parsed.success) {
        throw providerError('invalid-response', { providerRequestId: taskId });
      }
      const status = parsed.data.status;
      if (status === 'Pending' || status === 'Reasoning' || status === 'Generating') {
        delayMs = Math.min(Math.ceil(delayMs * 1.5), MAX_POLL_DELAY_MS);
        continue;
      }
      if (status === 'Request Moderated' || status === 'Content Moderated') {
        this.#observeLifecycle?.({
          providerId: 'bfl',
          modelId: BFL_FLUX_2_PRO_MODEL,
          stage: 'failed',
          providerRequestId: taskId,
          status,
        });
        throw providerError('moderation', { providerRequestId: taskId });
      }
      if (status === 'Error' || status === 'Failed' || status === 'Task not found') {
        this.#observeLifecycle?.({
          providerId: 'bfl',
          modelId: BFL_FLUX_2_PRO_MODEL,
          stage: 'failed',
          providerRequestId: taskId,
          status,
        });
        throw providerError('failure', { providerRequestId: taskId });
      }
      if (status !== 'Ready' || parsed.data.result == null) {
        throw providerError('invalid-response', { providerRequestId: taskId });
      }

      const deliveryUrl = new URL(parsed.data.result.sample);
      this.#observeLifecycle?.({
        providerId: 'bfl',
        modelId: BFL_FLUX_2_PRO_MODEL,
        stage: 'downloading',
        providerRequestId: taskId,
        deliveryOrigin: deliveryUrl.origin,
        status,
      });
      let downloaded: DownloadedProviderImage;
      try {
        downloaded = await this.#downloader.download(parsed.data.result.sample, signal);
      } catch (error) {
        if (signal.aborted && !(error instanceof ReferenceImageProviderError)) throw error;
        if (error instanceof ReferenceImageProviderError) {
          throw new ReferenceImageProviderError(error.reason, {
            providerId: 'bfl',
            providerRequestId: taskId,
            providerStage: 'download',
            ...(error.upstreamStatus === undefined ? {} : { upstreamStatus: error.upstreamStatus }),
            cause: error,
          });
        }
        throw connectionError(error, 'download', taskId);
      }
      this.#observeLifecycle?.({
        providerId: 'bfl',
        modelId: BFL_FLUX_2_PRO_MODEL,
        stage: 'ready',
        providerRequestId: taskId,
        status,
      });
      const usage = safeUsage(submitted.data);
      return {
        bytes: downloaded.bytes,
        mimeType: downloaded.mimeType,
        providerId: 'bfl',
        modelId: BFL_FLUX_2_PRO_MODEL,
        providerRequestId: taskId,
        ...(usage === undefined ? {} : { safeUsage: usage }),
      };
    }
  }
}
