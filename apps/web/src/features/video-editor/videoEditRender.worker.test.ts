// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDefaultVideoEditSpec } from '@studio/domain';
import type { VideoEditWorkerRequest, VideoEditWorkerResponse } from './types';

type WorkerMessageListener = (event: MessageEvent<VideoEditWorkerRequest>) => void;

const renderRequest = (
  operationId: number,
  overrides: Partial<Extract<VideoEditWorkerRequest, { type: 'render' }>> = {},
): VideoEditWorkerRequest => ({
  type: 'render',
  operationId,
  source: new Blob(['source'], { type: 'video/mp4' }),
  spec: createDefaultVideoEditSpec(1_000),
  sourceWidth: 1_280,
  sourceHeight: 720,
  requireAudio: false,
  targetResolution: null,
  includeAudio: true,
  ...overrides,
});

type ConversionOptions = {
  video: Record<string, unknown>;
  audio?: Record<string, unknown>;
};

/**
 * A media runtime that records the conversion it was asked for and produces one byte of output,
 * so a test can assert the geometry and track decisions without decoding anything.
 */
const stubMediaRuntime = () => {
  const initialized: ConversionOptions[] = [];
  let writable: WritableStream<{ data: Uint8Array; position: number }> | null = null;
  const videoTrack = { kind: 'video' };
  const audioTrack = { kind: 'audio' };
  vi.doMock('mediabunny', () => ({
    ALL_FORMATS: [],
    BlobSource: class {},
    Input: class {
      dispose = vi.fn();
      getPrimaryVideoTrack = () => Promise.resolve(videoTrack);
      getPrimaryAudioTrack = () => Promise.resolve(audioTrack);
    },
    Mp4OutputFormat: class {},
    Output: class {
      getMimeType = () => Promise.resolve('video/mp4');
    },
    StreamTarget: class {
      constructor(stream: WritableStream<{ data: Uint8Array; position: number }>) {
        writable = stream;
      }
    },
    Conversion: {
      init: (options: ConversionOptions) => {
        initialized.push(options);
        return Promise.resolve({
          isValid: true,
          utilizedTracks: [videoTrack, audioTrack],
          onProgress: null,
          cancel: () => Promise.resolve(),
          execute: async () => {
            const writer = writable!.getWriter();
            await writer.write({ data: new Uint8Array([1]), position: 0 });
            await writer.close();
          },
        });
      },
    },
    canEncodeAudio: vi.fn(() => Promise.resolve(true)),
    canEncodeVideo: vi.fn(() => Promise.resolve(true)),
  }));
  vi.doMock('./videoEditShader', () => ({
    createVideoEditFrameRenderer: () => ({ render: vi.fn(), dispose: vi.fn() }),
  }));
  vi.stubGlobal(
    'OffscreenCanvas',
    class {
      constructor(
        readonly width: number,
        readonly height: number,
      ) {}
    },
  );
  return { initialized };
};

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
  it('scales a placement to its exact destination size and can drop the audio track', async () => {
    const runtime = stubMediaRuntime();
    const worker = await loadWorker();

    worker.send(
      renderRequest(31, {
        // 1280x720 cropped to 9:16 and delivered at the placement's own size.
        spec: {
          ...createDefaultVideoEditSpec(1_000),
          crop: {
            preset: '9:16',
            rectangle: { x: 0.3222, y: 0, width: 0.3556, height: 1 },
          },
        },
        targetResolution: { width: 1_080, height: 1_920 },
        includeAudio: false,
      }),
    );

    await vi.waitFor(() =>
      expect(worker.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'complete', operationId: 31, mimeType: 'video/mp4' }),
      ),
    );
    const options = runtime.initialized[0]!;
    expect(options.video).toMatchObject({
      width: 1_080,
      height: 1_920,
      processedWidth: 1_080,
      processedHeight: 1_920,
      fit: 'fill',
      // The crop still runs against the source frame; only the delivery size is the placement's.
      crop: { left: 412, top: 0, width: 455, height: 720 },
    });
    expect(options.audio).toEqual({ discard: true });
  });

  it('leaves a local edit unscaled, keeping the crop geometry and its audio', async () => {
    const runtime = stubMediaRuntime();
    const worker = await loadWorker();

    worker.send(renderRequest(37));

    await vi.waitFor(() =>
      expect(worker.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'complete', operationId: 37 }),
      ),
    );
    expect(runtime.initialized[0]!.video).toMatchObject({
      width: 1_280,
      height: 720,
      processedWidth: 1_280,
      processedHeight: 720,
    });
    expect(runtime.initialized[0]!.audio).toEqual({ codec: 'aac', forceTranscode: true });
  });
});
