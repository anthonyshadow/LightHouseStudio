// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  PresentedRecordingArtifact,
  RecordingController,
  RemotePresentationMedia,
  RestorePersistedOriginalInput,
} from '../features/recording/types';
import { mockApiServer } from '../test/msw/server';
import {
  deriveOwnedMediaAcquisitionNotices,
  useOwnedMediaAcquisition,
} from './useOwnedMediaAcquisition';

const contentUrl = '/api/projects/8e08fa71-8b1a-49df-9f14-0446a71f3f01/source/content';

const remoteMedia: RemotePresentationMedia = {
  kind: 'remote-presentation',
  contentUrl,
  sizeBytes: 4,
  mimeType: 'video/mp4',
};

const remoteArtifact = (media: RemotePresentationMedia = remoteMedia): PresentedRecordingArtifact =>
  Object.freeze({
    id: 'project-media-remote',
    name: 'Project media · now · remote',
    createdAt: '2026-08-12T16:00:00.000Z',
    kind: 'uploaded',
    parentArtifactId: null,
    characterName: null,
    characterVariantName: null,
    media,
    objectUrl: media.contentUrl,
    mimeType: media.mimeType,
    filename: 'streamed.mp4',
    sourceModeId: 'local',
    startedAt: '2026-08-12T16:00:00.000Z',
    durationMs: 1_000,
    sizeBytes: media.sizeBytes,
  });

const recordingWith = (
  original: PresentedRecordingArtifact | null,
): Pick<RecordingController, 'original' | 'metadata' | 'restorePersistedOriginal'> => ({
  original,
  metadata: null,
  restorePersistedOriginal: vi.fn(
    (input: RestorePersistedOriginalInput) =>
      ({ ...remoteArtifact(), media: input.blob, objectUrl: 'blob:owned' }) as never,
  ),
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('useOwnedMediaAcquisition', () => {
  it('fetches the content route and republishes owned bytes under the same identity', async () => {
    mockApiServer.use(
      http.get(`*${contentUrl}`, () =>
        HttpResponse.arrayBuffer(new Uint8Array([9, 9, 9, 9]).buffer, {
          headers: { 'Content-Type': 'video/mp4', 'Content-Length': '4' },
        }),
      ),
    );
    const recording = recordingWith(remoteArtifact());
    const hook = renderHook(() =>
      useOwnedMediaAcquisition({ recording: recording as RecordingController }),
    );

    let acquired = false;
    await act(async () => {
      acquired = await hook.result.current.acquire();
    });

    expect(acquired).toBe(true);
    expect(recording.restorePersistedOriginal).toHaveBeenCalledOnce();
    const input = vi.mocked(recording.restorePersistedOriginal).mock.calls[0]![0];
    expect(input.blob).toBeInstanceOf(Blob);
    expect(input.blob.size).toBe(4);
    expect(input.artifactMetadata.id).toBe('project-media-remote');
    expect(input.artifactMetadata.filename).toBe('streamed.mp4');
    expect(hook.result.current.state.status).toBe('idle');
  });

  it('resolves immediately without a request when the original is already owned bytes', async () => {
    const owned = { ...remoteArtifact(), media: new Blob(['owned']) };
    const recording = recordingWith(owned);
    const hook = renderHook(() =>
      useOwnedMediaAcquisition({ recording: recording as RecordingController }),
    );

    await expect(hook.result.current.acquire()).resolves.toBe(true);
    expect(recording.restorePersistedOriginal).not.toHaveBeenCalled();
  });

  it('reports progress while fetching and returns to idle after a cancel', async () => {
    mockApiServer.use(
      http.get(`*${contentUrl}`, async () => {
        await delay(150);
        return HttpResponse.arrayBuffer(new Uint8Array([1, 2, 3, 4]).buffer, {
          headers: { 'Content-Type': 'video/mp4', 'Content-Length': '4' },
        });
      }),
    );
    const recording = recordingWith(remoteArtifact());
    const hook = renderHook(() =>
      useOwnedMediaAcquisition({ recording: recording as RecordingController }),
    );

    let outcome: Promise<boolean>;
    act(() => {
      outcome = hook.result.current.acquire();
    });
    await waitFor(() => expect(hook.result.current.state.status).toBe('fetching'));

    act(() => hook.result.current.cancel());
    await expect(outcome!).resolves.toBe(false);
    expect(hook.result.current.state.status).toBe('idle');
    expect(recording.restorePersistedOriginal).not.toHaveBeenCalled();
  });

  it('reports a recoverable error and succeeds on retry', async () => {
    let attempts = 0;
    mockApiServer.use(
      http.get(`*${contentUrl}`, () => {
        attempts += 1;
        return attempts === 1
          ? HttpResponse.error()
          : HttpResponse.arrayBuffer(new Uint8Array([1, 2, 3, 4]).buffer, {
              headers: { 'Content-Type': 'video/mp4', 'Content-Length': '4' },
            });
      }),
    );
    const recording = recordingWith(remoteArtifact());
    const hook = renderHook(() =>
      useOwnedMediaAcquisition({ recording: recording as RecordingController }),
    );

    await act(async () => {
      await expect(hook.result.current.acquire()).resolves.toBe(false);
    });
    expect(hook.result.current.state.status).toBe('error');

    await act(async () => {
      await expect(hook.result.current.acquire()).resolves.toBe(true);
    });
    expect(hook.result.current.state.status).toBe('idle');
    expect(recording.restorePersistedOriginal).toHaveBeenCalledOnce();
  });

  it('aborts a stale fetch when the presented artifact goes away', async () => {
    mockApiServer.use(
      http.get(`*${contentUrl}`, async () => {
        await delay(200);
        return HttpResponse.arrayBuffer(new Uint8Array([1, 2, 3, 4]).buffer, {
          headers: { 'Content-Type': 'video/mp4', 'Content-Length': '4' },
        });
      }),
    );
    const artifact = remoteArtifact();
    const recording = recordingWith(artifact);
    const hook = renderHook<
      ReturnType<typeof useOwnedMediaAcquisition>,
      { original: PresentedRecordingArtifact | null }
    >(
      ({ original }) =>
        useOwnedMediaAcquisition({
          recording: { ...recording, original } as RecordingController,
        }),
      { initialProps: { original: artifact } },
    );

    let outcome: Promise<boolean>;
    act(() => {
      outcome = hook.result.current.acquire();
    });
    await waitFor(() => expect(hook.result.current.state.status).toBe('fetching'));

    hook.rerender({ original: null });
    await expect(outcome!).resolves.toBe(false);
    await waitFor(() => expect(hook.result.current.state.status).toBe('idle'));
    expect(recording.restorePersistedOriginal).not.toHaveBeenCalled();
  });

  it('derives a progress notice with cancel, and an error notice with retry', () => {
    const handlers = { onCancel: vi.fn(), onRetry: vi.fn(), onDismissError: vi.fn() };
    const fetching = deriveOwnedMediaAcquisitionNotices(
      { status: 'fetching', artifactId: 'a', receivedBytes: 2, totalBytes: 4 },
      handlers,
    );
    expect(fetching[0]).toMatchObject({
      severity: 'info',
      action: { label: 'Cancel' },
      progress: { value: 0.5 },
    });

    const failed = deriveOwnedMediaAcquisitionNotices(
      { status: 'error', artifactId: 'a', message: 'nope' },
      handlers,
    );
    expect(failed[0]).toMatchObject({ severity: 'error', action: { label: 'Retry' } });
    expect(deriveOwnedMediaAcquisitionNotices({ status: 'idle' }, handlers)).toEqual([]);
  });
});
