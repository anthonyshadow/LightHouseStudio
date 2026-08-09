import type {
  HttpReply,
  HttpRequest,
  StreamLifecycle,
} from '../application/application-runtime.js';
import type { AudioStream } from '../application/audio-stream.js';

export interface RequestLifetime {
  readonly signal: AbortSignal;
  abort(reason?: unknown): void;
  release(): void;
}

export const createRequestLifetime = (request: HttpRequest, _reply: HttpReply): RequestLifetime => {
  const controller = new AbortController();
  const abortForRequest = (): void => controller.abort(request.signal.reason ?? 'client-aborted');
  request.signal.addEventListener('abort', abortForRequest, { once: true });

  return {
    signal: controller.signal,
    abort: (reason?: unknown) => controller.abort(reason ?? 'client-disconnected'),
    release: () => {
      request.signal.removeEventListener('abort', abortForRequest);
    },
  };
};

/** Runs a buffered JSON handler with request-abort propagation and deterministic listener cleanup. */
export const withRequestLifetime = async <Result>(
  request: HttpRequest,
  reply: HttpReply,
  handler: (signal: AbortSignal) => Promise<Result>,
): Promise<Result> => {
  const lifetime = createRequestLifetime(request, reply);
  try {
    return await handler(lifetime.signal);
  } finally {
    lifetime.release();
  }
};

export const sendAudioStream = (
  reply: HttpReply,
  audio: AudioStream,
  lifecycle?: StreamLifecycle,
): HttpReply => {
  void reply.type(audio.contentType);
  void reply.header('Content-Disposition', 'inline');
  if (audio.contentLength !== undefined) {
    void reply.header('Content-Length', String(audio.contentLength));
  }
  return reply.sendStream(audio.body, lifecycle);
};
