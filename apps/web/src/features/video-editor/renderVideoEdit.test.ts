// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultVideoEditSpec } from '@studio/domain';
import { renderVideoEdit } from './renderVideoEdit';

// The capability is this module's precondition, not its subject: these cases are about the worker
// protocol, so the browser is stated to be able to encode rather than made to prove it.
vi.mock('./videoEditSupport', () => ({ videoEditExportSupported: () => Promise.resolve(true) }));
import type { VideoEditWorkerRequest, VideoEditWorkerResponse } from './types';

class FakeWorker {
  static instances: FakeWorker[] = [];

  onmessage: ((event: MessageEvent<VideoEditWorkerResponse>) => void) | null = null;
  onerror: (() => void) | null = null;
  readonly postMessage = vi.fn<(message: VideoEditWorkerRequest) => void>();
  readonly terminate = vi.fn();

  constructor() {
    FakeWorker.instances.push(this);
  }

  emit(message: VideoEditWorkerResponse): void {
    this.onmessage?.({ data: message } as MessageEvent<VideoEditWorkerResponse>);
  }
}

const input = (signal: AbortSignal, onProgress = vi.fn()) => ({
  source: new Blob(['source'], { type: 'video/mp4' }),
  spec: createDefaultVideoEditSpec(1_000),
  sourceWidth: 1_280,
  sourceHeight: 720,
  requireAudio: false,
  signal,
  onProgress,
});

beforeEach(() => {
  FakeWorker.instances = [];
  vi.stubGlobal('Worker', FakeWorker);
});

afterEach(() => vi.unstubAllGlobals());

/**
 * The render asks whether the browser can encode before it spawns anything, so the worker appears
 * one microtask after the call rather than during it.
 */
const startedWorker = async (): Promise<FakeWorker> => {
  await vi.waitFor(() => expect(FakeWorker.instances[0]).toBeDefined());
  return FakeWorker.instances[0]!;
};

describe('renderVideoEdit', () => {
  it('reports bounded progress, ignores stale responses, and resolves a completed MP4', async () => {
    const controller = new AbortController();
    const onProgress = vi.fn();
    const promise = renderVideoEdit(input(controller.signal, onProgress));
    const worker = await startedWorker();
    const renderRequest = worker.postMessage.mock.calls[0]![0];
    expect(renderRequest.type).toBe('render');
    const operationId = renderRequest.operationId;

    worker.emit({ type: 'progress', operationId: operationId + 1, progress: 0.5 });
    worker.emit({ type: 'progress', operationId, progress: 1.5 });
    expect(onProgress).toHaveBeenCalledOnce();
    expect(onProgress).toHaveBeenCalledWith(1);

    const blob = new Blob(['edited'], { type: 'video/mp4' });
    worker.emit({ type: 'complete', operationId, blob, mimeType: 'video/mp4' });
    await expect(promise).resolves.toEqual({ blob, mimeType: 'video/mp4' });
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('requests cancellation and terminates after the worker acknowledges it', async () => {
    const controller = new AbortController();
    const promise = renderVideoEdit(input(controller.signal));
    const worker = await startedWorker();
    const renderRequest = worker.postMessage.mock.calls[0]![0];
    const operationId = renderRequest.operationId;

    controller.abort();
    expect(worker.postMessage).toHaveBeenLastCalledWith({ type: 'cancel', operationId });
    worker.emit({ type: 'canceled', operationId });

    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('terminates and returns an app-owned error when the worker fails', async () => {
    const promise = renderVideoEdit(input(new AbortController().signal));
    const worker = await startedWorker();
    worker.onerror?.();
    await expect(promise).rejects.toThrow(/stopped unexpectedly/iu);
    expect(worker.terminate).toHaveBeenCalledOnce();
  });
});
