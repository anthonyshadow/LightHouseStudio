import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AudioStream } from '../application/audio-stream.js';

export interface RequestLifetime {
  readonly signal: AbortSignal;
  release(): void;
}

export const createRequestLifetime = (
  request: FastifyRequest,
  reply: FastifyReply,
): RequestLifetime => {
  const controller = new AbortController();
  const abortForRequest = (): void => controller.abort('client-aborted');
  const abortForResponse = (): void => {
    if (!reply.raw.writableEnded) controller.abort('client-disconnected');
  };

  request.raw.once('aborted', abortForRequest);
  reply.raw.once('close', abortForResponse);

  return {
    signal: controller.signal,
    release: () => {
      request.raw.off('aborted', abortForRequest);
      reply.raw.off('close', abortForResponse);
    },
  };
};

export const sendAudioStream = (reply: FastifyReply, audio: AudioStream): FastifyReply => {
  void reply.type(audio.contentType);
  void reply.header('Content-Disposition', 'inline');
  if (audio.contentLength !== undefined) {
    void reply.header('Content-Length', String(audio.contentLength));
  }
  return reply.send(audio.body);
};
