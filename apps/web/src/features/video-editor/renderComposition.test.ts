// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Composition } from '@studio/domain';
import { compositionRenderMediaOf, renderComposition } from './renderComposition';
import type {
  CompositionRenderPlan,
  VideoEditWorkerRequest,
  VideoEditWorkerResponse,
} from './types';

// The capability is this module's precondition, not its subject.
vi.mock('./videoEditSupport', () => ({ videoEditExportSupported: () => Promise.resolve(true) }));

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

const composition: Composition = {
  clips: [
    {
      id: '00000000-0000-4000-8000-000000000001',
      media: { kind: 'asset', assetId: '79b94c02-d268-4201-a05b-1f3baa0caed1' },
      trim: { startMs: 0, endMs: 1_000 },
      audio: { level: 100, muted: false },
    },
  ],
  subtitles: [],
};

const media = [
  {
    url: 'http://localhost:3000/api/projects/p/sources/a/content',
    mimeType: 'video/mp4',
    filename: 'a.mp4',
    width: 1_280,
    height: 720,
  },
];

const plan: CompositionRenderPlan = {
  durationMs: 1_000,
  video: { target: { width: 1_280, height: 720 }, clips: ['kept'] },
  audio: null,
};

const startedWorker = async (): Promise<FakeWorker> => {
  await vi.waitFor(() => expect(FakeWorker.instances[0]).toBeDefined());
  return FakeWorker.instances[0]!;
};

beforeEach(() => {
  FakeWorker.instances = [];
  vi.stubGlobal('Worker', FakeWorker);
});

afterEach(() => vi.unstubAllGlobals());

describe('renderComposition', () => {
  it('posts the arrangement and its media, forwards the plan once, and resolves the file with it', async () => {
    const controller = new AbortController();
    const onPlan = vi.fn();
    const onProgress = vi.fn();
    const promise = renderComposition({
      composition,
      media,
      signal: controller.signal,
      onProgress,
      onPlan,
    });
    const worker = await startedWorker();
    const [request] = worker.postMessage.mock.calls[0]!;
    expect(request).toMatchObject({ type: 'render-composition', composition, media });
    const operationId = (request as { operationId: number }).operationId;

    worker.emit({ type: 'plan', operationId, plan });
    worker.emit({ type: 'progress', operationId, progress: 0.25 });
    // A response for some other render is not this one's.
    worker.emit({ type: 'progress', operationId: operationId + 1, progress: 0.9 });
    const blob = new Blob(['mp4'], { type: 'video/mp4' });
    worker.emit({ type: 'complete', operationId, blob, mimeType: 'video/mp4' });

    await expect(promise).resolves.toEqual({ blob, mimeType: 'video/mp4', plan });
    expect(onPlan).toHaveBeenCalledExactlyOnceWith(plan);
    expect(onProgress).toHaveBeenCalledExactlyOnceWith(0.25);
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('cancels through the worker on abort and settles once the worker acknowledges', async () => {
    const controller = new AbortController();
    const promise = renderComposition({
      composition,
      media,
      signal: controller.signal,
      onProgress: vi.fn(),
    });
    const worker = await startedWorker();
    const operationId = (worker.postMessage.mock.calls[0]![0] as { operationId: number })
      .operationId;
    controller.abort();
    expect(worker.postMessage).toHaveBeenLastCalledWith({ type: 'cancel', operationId });
    worker.emit({ type: 'canceled', operationId });
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('rejects with the worker’s own message, and refuses media that does not describe the clips', async () => {
    const controller = new AbortController();
    const promise = renderComposition({
      composition,
      media,
      signal: controller.signal,
      onProgress: vi.fn(),
    });
    const worker = await startedWorker();
    const operationId = (worker.postMessage.mock.calls[0]![0] as { operationId: number })
      .operationId;
    worker.emit({ type: 'error', operationId, message: '“a.mp4” has no video track.' });
    await expect(promise).rejects.toThrow('“a.mp4” has no video track.');

    await expect(
      renderComposition({
        composition,
        media: [],
        signal: controller.signal,
        onProgress: vi.fn(),
      }),
    ).rejects.toThrow(/cannot open/u);
    expect(FakeWorker.instances).toHaveLength(1);
  });

  it('describes a clip’s media by an absolute URL and the facts the plan is made from', () => {
    expect(
      compositionRenderMediaOf({
        contentUrl: '/api/projects/p/sources/a/content',
        mimeType: 'video/mp4',
        filename: 'a.mp4',
        width: 1_080,
        height: 1_920,
        durationMs: 12_000,
        hasAudio: false,
      }),
    ).toEqual({
      url: `${window.location.origin}/api/projects/p/sources/a/content`,
      mimeType: 'video/mp4',
      filename: 'a.mp4',
      width: 1_080,
      height: 1_920,
    });
  });
});
