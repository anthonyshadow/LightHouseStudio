import type { ApiErrorCode } from '@studio/contracts';

const normalizeUpstreamStatus = (value: number | undefined): number | undefined =>
  value !== undefined && Number.isInteger(value) && value >= 400 && value <= 599
    ? value
    : undefined;

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
    const upstreamStatus = normalizeUpstreamStatus(options?.upstreamStatus);
    if (upstreamStatus !== undefined) this.upstreamStatus = upstreamStatus;
  }
}
