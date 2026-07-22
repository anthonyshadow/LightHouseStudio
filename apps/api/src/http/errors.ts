import {
  apiErrorResponseSchema,
  type ApiErrorCode,
  type ApiErrorResponse,
} from '@studio/contracts';
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from './app-error.js';

export type ApiErrorBody = ApiErrorResponse;

export { AppError } from './app-error.js';

export interface ErrorDiagnostic {
  readonly errorClass: string;
  readonly reason?: string;
}

export interface ErrorTranslation {
  readonly appError: AppError;
  readonly diagnostic: ErrorDiagnostic;
}

export type ErrorTranslator = (error: Error) => ErrorTranslation | undefined;

const errorBody = (code: ApiErrorCode, message: string, upstreamStatus?: number): ApiErrorBody =>
  apiErrorResponseSchema.parse({
    error: { code, message, ...(upstreamStatus === undefined ? {} : { upstreamStatus }) },
  });

const isFastifyError = (error: unknown): error is FastifyError =>
  error instanceof Error && 'code' in error && typeof error.code === 'string';

const normalizeFastifyError = (error: FastifyError): AppError | undefined => {
  if (error.code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
    return new AppError(413, 'payload_too_large', 'The request body exceeds the allowed size.');
  }
  if (error.code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE') {
    return new AppError(
      400,
      'unsupported_media_type',
      'Use a supported audio recording format such as WebM, MP4, Ogg, WAV, MPEG, or AAC.',
    );
  }
  if (error.code.startsWith('FST_ERR_CTP_') || error.statusCode === 400) {
    return new AppError(400, 'bad_request', 'The request body is not valid.');
  }
  return undefined;
};

const translateFrameworkError = (error: Error): ErrorTranslation | undefined => {
  if (error instanceof AppError) {
    return { appError: error, diagnostic: { errorClass: 'AppError' } };
  }
  if (!isFastifyError(error)) return undefined;
  const appError = normalizeFastifyError(error);
  return appError === undefined
    ? undefined
    : { appError, diagnostic: { errorClass: 'FastifyError' } };
};

const translateError = (
  error: Error,
  translators: readonly ErrorTranslator[],
): ErrorTranslation => {
  const framework = translateFrameworkError(error);
  if (framework !== undefined) return framework;
  for (const translator of translators) {
    const translated = translator(error);
    if (translated !== undefined) return translated;
  }
  return {
    appError: new AppError(500, 'internal_error', 'The server could not complete the request.'),
    diagnostic: { errorClass: 'InternalError' },
  };
};

const sanitizeStackFrames = (error: Error): readonly string[] =>
  (error.stack?.split('\n').slice(1) ?? [])
    .map((frame) => frame.trim())
    .filter((frame) => frame.startsWith('at '))
    .slice(0, 5)
    .map((frame) => {
      const normalized = frame.replaceAll('file://', '');
      const match = /^(at (?:[^ (]+ )?\()?(.+?):(\d+):(\d+)\)?$/u.exec(normalized);
      if (match === null) return 'at <unavailable>';
      const prefix = match[1] ?? 'at ';
      const source = match[2] ?? '<unavailable>';
      const safeSource = source.split(/[\\/]/u).slice(-3).join('/');
      return `${prefix}${safeSource}:${match[3]}:${match[4]}${prefix.endsWith('(') ? ')' : ''}`;
    });

export const installErrorHandling = (
  app: FastifyInstance,
  options: {
    readonly serveSpa?: boolean;
    readonly translators?: readonly ErrorTranslator[];
  } = {},
): void => {
  app.setNotFoundHandler(async (request, reply) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (
      options.serveSpa === true &&
      request.method === 'GET' &&
      pathname !== '/api' &&
      !pathname.startsWith('/api/') &&
      request.headers.accept?.includes('text/html') === true
    ) {
      await reply.sendFile('index.html');
      return;
    }
    await reply.status(404).send(errorBody('not_found', 'No API route matches this request.'));
  });

  app.setErrorHandler(
    async (error: Error, request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      const translation = translateError(error, options.translators ?? []);
      const safeError = translation.appError;

      if (safeError.statusCode >= 500) {
        const diagnostic = translation.diagnostic;
        request.log.error(
          {
            requestId: request.id,
            method: request.method,
            route: request.routeOptions.url,
            elapsedMs: Math.round(reply.elapsedTime),
            statusCode: safeError.statusCode,
            code: safeError.code,
            errorClass: diagnostic.errorClass,
            ...(diagnostic.reason === undefined ? {} : { reason: diagnostic.reason }),
            ...(safeError.upstreamStatus === undefined
              ? {}
              : { upstreamStatus: safeError.upstreamStatus }),
            stackFrames: sanitizeStackFrames(error),
          },
          'API request failed',
        );
      }

      await reply
        .status(safeError.statusCode)
        .send(errorBody(safeError.code, safeError.message, safeError.upstreamStatus));
    },
  );
};
