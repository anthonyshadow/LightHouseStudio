import { z } from 'zod';
import type { SupportedModelId } from '@studio/contracts';
import { ProviderError } from '../provider-error.js';

export type { SupportedModelId };

export interface TokenRequestScope {
  readonly model: SupportedModelId;
  readonly origin: string;
  readonly expiresInSeconds: number;
  readonly maxSessionDurationSeconds: number;
  readonly signal: AbortSignal;
}

export interface TemporaryToken {
  readonly apiKey: string;
  readonly expiresAt: string;
}

export interface DecartTokenProvider {
  createToken(scope: TokenRequestScope): Promise<TemporaryToken>;
}

const sdkTokenSchema = z
  .object({
    apiKey: z.string().trim().min(1),
    expiresAt: z.union([z.string().min(1), z.number().finite(), z.date()]),
  })
  .passthrough();

interface DecartSdkClient {
  readonly tokens: {
    create(options: {
      readonly expiresIn: number;
      readonly allowedModels: readonly string[];
      readonly allowedOrigins: readonly string[];
      readonly constraints: {
        readonly realtime: { readonly maxSessionDuration: number };
      };
    }): Promise<unknown>;
  };
}

interface DecartSdkModule {
  readonly createDecartClient: (options: {
    readonly apiKey: string;
    readonly telemetry: false;
    readonly logger?: unknown;
  }) => DecartSdkClient;
  readonly noopLogger?: unknown;
}

const isRecord = (value: unknown): value is Record<PropertyKey, unknown> =>
  typeof value === 'object' && value !== null;

const isDecartSdkModule = (value: unknown): value is DecartSdkModule =>
  isRecord(value) && typeof value.createDecartClient === 'function';

const isDecartSdkClient = (value: unknown): value is DecartSdkClient =>
  isRecord(value) && isRecord(value.tokens) && typeof value.tokens.create === 'function';

const normalizeExpiry = (value: string | number | Date): string => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new ProviderError('token', 'invalid-response');
  return date.toISOString();
};

const numericStatusFrom = (error: unknown): number | undefined => {
  if (typeof error !== 'object' || error === null) return undefined;
  const possible = error as { readonly status?: unknown; readonly statusCode?: unknown };
  if (typeof possible.status === 'number') return possible.status;
  if (typeof possible.statusCode === 'number') return possible.statusCode;
  return undefined;
};

export class DecartSdkTokenProvider implements DecartTokenProvider {
  readonly #apiKey: string;
  readonly #timeoutMs: number;

  constructor(apiKey: string, timeoutMs = 15_000) {
    this.#apiKey = apiKey;
    this.#timeoutMs = timeoutMs;
  }

  async createToken(scope: TokenRequestScope): Promise<TemporaryToken> {
    if (scope.signal.aborted) throw new ProviderError('token', 'aborted');
    const timeoutSignal = AbortSignal.timeout(this.#timeoutMs);
    const effectiveSignal = AbortSignal.any([scope.signal, timeoutSignal]);
    const abortError = (): ProviderError =>
      scope.signal.aborted
        ? new ProviderError('token', 'aborted')
        : new ProviderError('token', 'timeout');

    try {
      // Kept lazy so starting and recording a local session cannot load the Decart SDK.
      const loadedSdk: unknown = await import('@decartai/sdk');
      if (!isDecartSdkModule(loadedSdk)) {
        throw new ProviderError('token', 'invalid-response');
      }

      const client = loadedSdk.createDecartClient({
        apiKey: this.#apiKey,
        telemetry: false,
        ...(loadedSdk.noopLogger === undefined ? {} : { logger: loadedSdk.noopLogger }),
      });
      if (!isDecartSdkClient(client)) {
        throw new ProviderError('token', 'invalid-response');
      }
      const tokenPromise = client.tokens.create({
        expiresIn: scope.expiresInSeconds,
        allowedModels: [scope.model],
        allowedOrigins: [scope.origin],
        constraints: {
          realtime: { maxSessionDuration: scope.maxSessionDurationSeconds },
        },
      });

      const result = await new Promise<unknown>((resolve, reject) => {
        if (effectiveSignal.aborted) {
          reject(abortError());
          return;
        }
        const onAbort = (): void => reject(abortError());
        effectiveSignal.addEventListener('abort', onAbort, { once: true });
        void tokenPromise.then(
          (token) => {
            effectiveSignal.removeEventListener('abort', onAbort);
            resolve(token);
          },
          (error: unknown) => {
            effectiveSignal.removeEventListener('abort', onAbort);
            reject(error instanceof Error ? error : new Error('Decart token issuance failed.'));
          },
        );
      });
      const parsed = sdkTokenSchema.safeParse(result);
      if (!parsed.success) throw new ProviderError('token', 'invalid-response');

      return {
        apiKey: parsed.data.apiKey,
        expiresAt: normalizeExpiry(parsed.data.expiresAt),
      };
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      if (scope.signal.aborted) throw new ProviderError('token', 'aborted');
      if (timeoutSignal.aborted) throw new ProviderError('token', 'timeout');
      throw new ProviderError('token', 'upstream', numericStatusFrom(error));
    }
  }
}
