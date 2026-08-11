// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDefaultVideoEditSpec } from '@studio/domain';
import type { VideoEditWorkerRequest, VideoEditWorkerResponse } from './types';

type WorkerMessageListener = (event: MessageEvent<VideoEditWorkerRequest>) => void;

const renderRequest = (operationId: number): VideoEditWorkerRequest => ({
  type: 'render',
  operationId,
  source: new Blob(['source'], { type: 'video/mp4' }),
  spec: createDefaultVideoEditSpec(1_000),
  sourceWidth: 1_280,
  sourceHeight: 720,
  requireAudio: false,
});

const loadWorker = async () => {
  let listener: WorkerMessageListener | undefined;
  const postMessage = vi.fn<(message: VideoEditWorkerResponse) => void>();
  vi.stubGlobal(
    'addEventListener',
    vi.fn((type: string, nextListener: WorkerMessageListener) => {
      if (type === 'message') listener = nextListener;
    }),
  );
  vi.stubGlobal('postMessage', postMessage);
  await import('./videoEditRender.worker');
  if (!listener) throw new Error('The worker did not install its message listener.');
  return {
    postMessage,
    send: (request: VideoEditWorkerRequest, origin = '') =>
      listener?.({ data: request, origin } as MessageEvent<VideoEditWorkerRequest>),
  };
};

afterEach(() => {
  vi.doUnmock('mediabunny');
  vi.resetModules();
  vi.unstubAllGlobals();
});

describe('videoEditRender worker runtime', () => {
  it('rejects non-worker origins and acknowledges cancellation while the media runtime loads', async () => {
    let resolveMediaRuntime: ((exports: Record<string, unknown>) => void) | undefined;
    vi.doMock(
      'mediabunny',
      () =>
        new Promise<Record<string, unknown>>((resolve) => {
          resolveMediaRuntime = resolve;
        }),
    );
    const worker = await loadWorker();

    worker.send(renderRequest(17));
    await vi.waitFor(() => expect(resolveMediaRuntime).toBeTypeOf('function'));
    worker.send({ type: 'cancel', operationId: 17 }, 'https://untrusted.example');
    expect(worker.postMessage).not.toHaveBeenCalled();
    worker.send({ type: 'cancel', operationId: 17 });
    expect(worker.postMessage).toHaveBeenCalledExactlyOnceWith({
      type: 'canceled',
      operationId: 17,
    });

    resolveMediaRuntime?.({});
    await vi.waitFor(() => expect(worker.postMessage).toHaveBeenCalledTimes(1));
  });

  it('normalizes initialization failures and disposes a partially constructed media input', async () => {
    const dispose = vi.fn();
    class Input {
      dispose = dispose;

      getPrimaryVideoTrack(): Promise<never> {
        return Promise.reject(new Error('provider initialization detail'));
      }

      getPrimaryAudioTrack(): Promise<null> {
        return Promise.resolve(null);
      }
    }
    vi.doMock('mediabunny', () => ({
      ALL_FORMATS: [],
      BlobSource: class {},
      Conversion: {},
      Input,
      Mp4OutputFormat: class {},
      Output: class {},
      StreamTarget: class {},
      canEncodeAudio: vi.fn(),
      canEncodeVideo: vi.fn(),
    }));
    const worker = await loadWorker();

    worker.send(renderRequest(23));

    await vi.waitFor(() =>
      expect(worker.postMessage).toHaveBeenCalledWith({
        type: 'error',
        operationId: 23,
        message: 'The browser could not render this edit. The current video remains unchanged.',
      }),
    );
    expect(dispose).toHaveBeenCalledExactlyOnceWith();
  });
});
