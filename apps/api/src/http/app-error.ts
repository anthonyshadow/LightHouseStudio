import type { ApiErrorCode } from '@studio/contracts';

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: ApiErrorCode;
  readonly upstreamStatus?: number;

  constructor(
    statusCode: number,
    code: ApiErrorCode,
    message: string,
    options?: { readonly upstreamStatus?: number; readonly cause?: unknown },
  ) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    if (options?.upstreamStatus !== undefined) this.upstreamStatus = options.upstreamStatus;
  }
}
