import {
  apiErrorResponseSchema,
  type ApiErrorCode,
  type ApiErrorResponse,
} from '@studio/contracts';
import type {
  ApplicationRuntime,
  HttpReply,
  HttpRequest,
} from '../application/application-runtime.js';
import { AppError } from './app-error.js';

export { AppError } from './app-error.js';

export interface ErrorDiagnostic {
  readonly errorClass: string;
  readonly reason?: string;
  readonly providerId?: string;
  readonly providerRequestId?: string;
  readonly providerStage?: string;
}

export interface ErrorTranslation {
  readonly appError: AppError;
  readonly diagnostic: ErrorDiagnostic;
}

export type ErrorTranslator = (error: Error) => ErrorTranslation | undefined;

const errorBody = (
  code: ApiErrorCode,
  message: string,
  upstreamStatus?: number,
): ApiErrorResponse =>
  apiErrorResponseSchema.parse({
    error: { code, message, ...(upstreamStatus === undefined ? {} : { upstreamStatus }) },
  });

const translateFrameworkError = (error: Error): ErrorTranslation | undefined => {
  if (error instanceof AppError) {
    return { appError: error, diagnostic: { errorClass: 'AppError' } };
  }
  return undefined;
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
  app: ApplicationRuntime,
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
    reply.status(404).send(errorBody('not_found', 'No API route matches this request.'));
  });

  app.setErrorHandler((error: Error, request: HttpRequest, reply: HttpReply): void => {
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
          ...(diagnostic.providerId === undefined ? {} : { providerId: diagnostic.providerId }),
          ...(diagnostic.providerRequestId === undefined
            ? {}
            : { providerRequestId: diagnostic.providerRequestId }),
          ...(diagnostic.providerStage === undefined
            ? {}
            : { providerStage: diagnostic.providerStage }),
          ...(safeError.upstreamStatus === undefined
            ? {}
            : { upstreamStatus: safeError.upstreamStatus }),
          stackFrames: sanitizeStackFrames(error),
        },
        'API request failed',
      );
    }

    reply
      .status(safeError.statusCode)
      .send(errorBody(safeError.code, safeError.message, safeError.upstreamStatus));
  });
};
