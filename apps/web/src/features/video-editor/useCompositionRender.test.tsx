// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { Composition } from '@studio/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectClipMedia } from '../projects/projectClipMedia';
import type { RenderCompositionInput, RenderCompositionResult } from './renderComposition';
import type { CompositionRenderPlan } from './types';
import { useCompositionRender } from './useCompositionRender';

const renderComposition =
  vi.fn<(input: RenderCompositionInput) => Promise<RenderCompositionResult>>();
vi.mock('./renderComposition', () => ({
  renderComposition: (input: RenderCompositionInput) => renderComposition(input),
  compositionRenderMediaOf: (media: ProjectClipMedia) => ({
    url: `http://localhost${media.contentUrl}`,
    mimeType: media.mimeType,
    filename: media.filename,
    width: media.width,
    height: media.height,
    hasAudio: media.hasAudio,
  }),
}));

const validateEditedVideoOutput = vi.fn<() => Promise<unknown>>();
vi.mock('../existing-video/videoValidation', () => ({
  validateEditedVideoOutput: (...args: unknown[]) => validateEditedVideoOutput(...(args as [])),
}));

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

const media: ProjectClipMedia[] = [
  {
    contentUrl: '/api/projects/p/sources/a/content',
    mimeType: 'video/mp4',
    filename: 'a.mp4',
    width: 1_280,
    height: 720,
    durationMs: 1_000,
    hasAudio: true,
  },
];

const plan: CompositionRenderPlan = {
  durationMs: 1_000,
  video: { target: { width: 1_280, height: 720 }, clips: ['kept'] },
  audio: { target: { sampleRate: 48_000, numberOfChannels: 2 }, fellBack: false, clips: ['kept'] },
};

/** A render the test settles by hand, exposing what the hook handed it. */
const deferredRender = () => {
  let resolve!: (result: RenderCompositionResult) => void;
  let reject!: (error: unknown) => void;
  let input!: RenderCompositionInput;
  renderComposition.mockImplementation((given) => {
    input = given;
    return new Promise<RenderCompositionResult>((res, rej) => {
      resolve = res;
      reject = rej;
    });
  });
  return {
    resolve: (r: RenderCompositionResult) => resolve(r),
    reject: (e: unknown) => reject(e),
    input: () => input,
  };
};

const createObjectURL = vi.fn(() => 'blob:preview');
const revokeObjectURL = vi.fn();

beforeEach(() => {
  renderComposition.mockReset();
  validateEditedVideoOutput.mockReset().mockResolvedValue({});
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
});

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(URL, 'createObjectURL');
  Reflect.deleteProperty(URL, 'revokeObjectURL');
});

describe('useCompositionRender', () => {
  it('renders, validates against the plan, and offers the file by a URL it later revokes', async () => {
    const deferred = deferredRender();
    const hook = renderHook(() => useCompositionRender());
    expect(hook.result.current.phase).toBe('idle');

    let pending!: Promise<void>;
    act(() => {
      pending = hook.result.current.render(composition, media);
    });
    expect(hook.result.current.phase).toBe('rendering');
    expect(deferred.input().media).toEqual([
      expect.objectContaining({ url: 'http://localhost/api/projects/p/sources/a/content' }),
    ]);
    act(() => {
      deferred.input().onPlan?.(plan);
      deferred.input().onProgress(0.4);
    });
    expect(hook.result.current.plan).toEqual(plan);
    expect(hook.result.current.progress).toBe(0.4);

    const blob = new Blob(['mp4'], { type: 'video/mp4' });
    await act(async () => {
      deferred.resolve({ blob, mimeType: 'video/mp4', plan });
      await pending;
    });
    // Validated against the plan's own frame and the sequence length, with sound expected.
    expect(validateEditedVideoOutput).toHaveBeenCalledWith(
      blob,
      {
        width: 1_280,
        height: 720,
        durationMs: 1_000,
        requireAudio: true,
        filename: 'arrangement.mp4',
      },
      expect.any(AbortSignal),
    );
    await waitFor(() => expect(hook.result.current.ready?.url).toBe('blob:preview'));
    expect(hook.result.current.phase).toBe('ready');
    expect(hook.result.current.progress).toBe(1);
    expect(hook.result.current.ready?.renderedFrom).toBe(composition);

    act(() => hook.result.current.discard());
    expect(hook.result.current.phase).toBe('idle');
    expect(hook.result.current.ready).toBeNull();
    await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith('blob:preview'));
  });

  it('returns to idle after a cancel settles, without an error', async () => {
    const deferred = deferredRender();
    const hook = renderHook(() => useCompositionRender());
    let pending!: Promise<void>;
    act(() => {
      pending = hook.result.current.render(composition, media);
    });
    act(() => deferred.input().onPlan?.(plan));
    act(() => hook.result.current.cancel());
    expect(deferred.input().signal.aborted).toBe(true);
    // Still rendering until the worker has acknowledged, or the client has given up on it.
    expect(hook.result.current.phase).toBe('rendering');
    await act(async () => {
      deferred.reject(new DOMException('Video rendering was canceled.', 'AbortError'));
      await pending;
    });
    expect(hook.result.current.phase).toBe('idle');
    expect(hook.result.current.error).toBeNull();
    // The plan described a file that is not coming.
    expect(hook.result.current.plan).toBeNull();
  });

  it('treats a cancel that lands as the worker finishes as the cancel it is, and is not stuck', async () => {
    const deferred = deferredRender();
    const hook = renderHook(() => useCompositionRender());
    let pending!: Promise<void>;
    act(() => {
      pending = hook.result.current.render(composition, media);
    });
    act(() => hook.result.current.cancel());
    // The worker had already finished: the client resolves the file after the abort.
    await act(async () => {
      deferred.resolve({ blob: new Blob(['mp4']), mimeType: 'video/mp4', plan });
      await pending;
    });
    expect(hook.result.current.phase).toBe('idle');
    expect(hook.result.current.error).toBeNull();
    expect(hook.result.current.ready).toBeNull();
    expect(hook.result.current.progress).toBe(0);
    expect(validateEditedVideoOutput).not.toHaveBeenCalled();
    // And the next press starts a render rather than finding the slot still taken.
    const next = deferredRender();
    act(() => {
      void hook.result.current.render(composition, media);
    });
    expect(hook.result.current.phase).toBe('rendering');
    expect(next.input()).toBeDefined();
  });

  it('returns to idle when the cancel lands during validation', async () => {
    const deferred = deferredRender();
    let rejectValidation!: (error: unknown) => void;
    let validationSignal: AbortSignal | undefined;
    validateEditedVideoOutput.mockImplementation(
      (...args: unknown[]) =>
        new Promise((_resolve, reject) => {
          validationSignal = args[2] as AbortSignal;
          rejectValidation = reject;
        }),
    );
    const hook = renderHook(() => useCompositionRender());
    let pending!: Promise<void>;
    act(() => {
      pending = hook.result.current.render(composition, media);
    });
    await act(async () => {
      deferred.resolve({ blob: new Blob(['mp4']), mimeType: 'video/mp4', plan });
      await Promise.resolve();
    });
    expect(hook.result.current.phase).toBe('validating');
    act(() => hook.result.current.cancel());
    expect(validationSignal?.aborted).toBe(true);
    await act(async () => {
      rejectValidation(new DOMException('Video inspection was canceled.', 'AbortError'));
      await pending;
    });
    expect(hook.result.current.phase).toBe('idle');
    expect(hook.result.current.ready).toBeNull();
  });

  it('reports a failure in the worker’s words, and a validation failure in the validator’s', async () => {
    const deferred = deferredRender();
    const hook = renderHook(() => useCompositionRender());
    let pending!: Promise<void>;
    act(() => {
      pending = hook.result.current.render(composition, media);
    });
    await act(async () => {
      deferred.input().onPlan?.(plan);
      deferred.reject(new Error('“a.mp4” has no video track.'));
      await pending;
    });
    expect(hook.result.current.phase).toBe('error');
    expect(hook.result.current.error).toBe('“a.mp4” has no video track.');
    // A failed render's plan is not kept: nothing on show is what it described.
    expect(hook.result.current.plan).toBeNull();

    validateEditedVideoOutput.mockRejectedValueOnce(
      new Error('The edited video dimensions did not match the requested crop.'),
    );
    const second = deferredRender();
    act(() => {
      pending = hook.result.current.render(composition, media);
    });
    await act(async () => {
      second.resolve({ blob: new Blob(['x']), mimeType: 'video/mp4', plan });
      await pending;
    });
    expect(hook.result.current.phase).toBe('error');
    expect(hook.result.current.error).toMatch(/dimensions did not match/u);
  });

  it('ignores a second press while rendering, and aborts the render on unmount', () => {
    const deferred = deferredRender();
    const hook = renderHook(() => useCompositionRender());
    act(() => {
      void hook.result.current.render(composition, media);
      void hook.result.current.render(composition, media);
    });
    expect(renderComposition).toHaveBeenCalledTimes(1);
    const { signal } = deferred.input();
    hook.unmount();
    expect(signal.aborted).toBe(true);
  });
});
