// @vitest-environment jsdom

import type { SavedVideoDetail } from '@studio/contracts';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { act, renderHook as renderTestingLibraryHook } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SaveVideoInput } from '../../adapters/api-client/savedVideosApi';
import { createRemoteStateQueryClient } from '../../application/remote-state/RemoteStateProvider';
import type { RecordingArtifact } from '../recording/types';

const api = vi.hoisted(() => ({
  appendSavedVideoVersion:
    vi.fn<
      (
        videoId: string,
        expectedVersionId: string,
        input: SaveVideoInput,
      ) => Promise<SavedVideoDetail>
    >(),
  appendSavedVideoVersionDirect:
    vi.fn<
      (
        videoId: string,
        expectedVersionId: string,
        input: SaveVideoInput,
      ) => Promise<SavedVideoDetail>
    >(),
  saveSavedVideoThumbnail:
    vi.fn<
      (
        videoId: string,
        versionId: string,
        thumbnail: Blob,
        signal?: AbortSignal,
      ) => Promise<SavedVideoDetail>
    >(),
  saveVideo: vi.fn<(input: SaveVideoInput) => Promise<SavedVideoDetail>>(),
  saveVideoDirect: vi.fn<(input: SaveVideoInput) => Promise<SavedVideoDetail>>(),
  createSavedVideoThumbnail:
    vi.fn<(video: Blob, signal: AbortSignal, frame?: 'auto' | 'first') => Promise<Blob>>(),
  createSavedVideoThumbnailFromImage: vi.fn<(image: Blob, signal: AbortSignal) => Promise<Blob>>(),
}));

vi.mock('../../adapters/api-client/savedVideosApi', () => ({
  appendSavedVideoVersion: api.appendSavedVideoVersion,
  appendSavedVideoVersionDirect: api.appendSavedVideoVersionDirect,
  saveSavedVideoThumbnail: api.saveSavedVideoThumbnail,
  saveVideo: api.saveVideo,
  saveVideoDirect: api.saveVideoDirect,
}));
vi.mock('./thumbnailClient', () => ({
  createSavedVideoThumbnail: api.createSavedVideoThumbnail,
  createSavedVideoThumbnailFromImage: api.createSavedVideoThumbnailFromImage,
}));

import { useSaveVideo } from './useSaveVideo';
import { savedVideoQueryKeys } from './savedVideoQueryKeys';

const queryClients: QueryClient[] = [];

const renderHook = <Result>(render: () => Result) => {
  const queryClient = createRemoteStateQueryClient();
  queryClients.push(queryClient);
  const hook = renderTestingLibraryHook(render, {
    wrapper: ({ children }) =>
      createElement(QueryClientProvider, { client: queryClient }, children),
  });
  return { ...hook, queryClient };
};

const videoId = 'c26b5280-1538-44cd-82db-a6b1356acf62';
const versionId = '2efcc6c3-e82c-419a-8807-c0026170fb75';
const savedVideo: SavedVideoDetail = {
  id: videoId,
  title: 'Morning take',
  status: 'ready',
  currentVersion: {
    id: versionId,
    videoId,
    ordinal: 1,
    origin: 'recorded',
    characterName: 'Mara',
    characterVariantName: null,
    sourceVersionId: null,
    mimeType: 'video/mp4',
    filename: 'morning-take.mp4',
    sizeBytes: 5,
    durationMs: 1_000,
    width: 1_280,
    height: 720,
    exportSpecification: null,
    createdAt: '2026-08-05T12:00:00.000Z',
  },
  sourceVideoId: null,
  versionCount: 1,
  thumbnailAvailable: false,
  revision: 1,
  createdAt: '2026-08-05T12:00:00.000Z',
  updatedAt: '2026-08-05T12:00:00.000Z',
  versions: [],
};
savedVideo.versions.push(savedVideo.currentVersion);

const artifact = (
  kind: RecordingArtifact['kind'] = 'recorded',
  id = crypto.randomUUID(),
): RecordingArtifact => ({
  id,
  name: 'Morning take',
  createdAt: '2026-08-05T12:00:00.000Z',
  kind,
  parentArtifactId: null,
  media: new Blob(['video'], { type: 'video/mp4' }),
  objectUrl: `blob:${id}`,
  mimeType: 'video/mp4',
  filename: 'morning-take.mp4',
  sourceModeId: 'local',
  startedAt: '2026-08-05T12:00:00.000Z',
  durationMs: 1_000,
  sizeBytes: 5,
});

describe('useSaveVideo', () => {
  beforeEach(() => {
    api.appendSavedVideoVersion.mockReset().mockResolvedValue(savedVideo);
    api.appendSavedVideoVersionDirect.mockReset().mockResolvedValue(savedVideo);
    api.saveSavedVideoThumbnail.mockReset().mockResolvedValue(savedVideo);
    api.saveVideo.mockReset().mockResolvedValue(savedVideo);
    api.saveVideoDirect.mockReset().mockResolvedValue(savedVideo);
    api.createSavedVideoThumbnail
      .mockReset()
      .mockResolvedValue(new Blob(['thumbnail'], { type: 'image/webp' }));
    api.createSavedVideoThumbnailFromImage
      .mockReset()
      .mockResolvedValue(new Blob(['uploaded'], { type: 'image/webp' }));
  });

  afterEach(() => {
    for (const queryClient of queryClients.splice(0)) queryClient.clear();
  });

  it('saves every runtime origin, reuses idempotency, and uploads an optional thumbnail', async () => {
    const { result } = renderHook(() => useSaveVideo());
    const original = artifact('recorded');

    await act(async () => {
      await result.current.save(original, {
        title: '  Explicit title  ',
        character: { characterName: 'Mara', characterVariantName: 'Evening' },
      });
      await result.current.save(original);
      for (const kind of ['uploaded', 'edited', 'visual', 'voice'] as const) {
        await result.current.save(artifact(kind));
      }
    });

    expect(result.current.state).toMatchObject({ status: 'saved', video: savedVideo });
    expect(api.saveVideo).toHaveBeenCalledTimes(6);
    expect(api.saveVideo.mock.calls[0]?.[0]).toMatchObject({
      title: 'Explicit title',
      origin: 'recorded',
      characterName: 'Mara',
      characterVariantName: 'Evening',
    });
    expect(api.saveVideo.mock.calls[1]?.[0].idempotencyKey).toBe(
      api.saveVideo.mock.calls[0]?.[0].idempotencyKey,
    );
    expect(api.saveVideo.mock.calls[1]?.[0].title).toBe('Morning take');
    expect(api.saveVideo.mock.calls.slice(2).map((call) => call[0].origin)).toEqual([
      'uploaded',
      'editor',
      'character-swap',
      'voice-treatment',
    ]);
    expect(api.saveSavedVideoThumbnail).toHaveBeenCalledTimes(6);
  });

  it('saves a visual result under the tool that produced it', async () => {
    const { result } = renderHook(() => useSaveVideo());

    await act(async () => {
      await result.current.save({ ...artifact('visual'), visualOperation: 'virtual-try-on' });
      await result.current.save({ ...artifact('visual'), visualOperation: 'character-swap' });
      await result.current.save(artifact('visual'));
    });

    expect(api.saveVideo.mock.calls.map((call) => call[0].origin)).toEqual([
      'virtual-try-on',
      'character-swap',
      // No operation recorded: the artifact predates the field, and Character Swap is the tool
      // that existed when it could have been made.
      'character-swap',
    ]);
  });

  it('appends a version, tolerates thumbnail failure, reports save failure, and resets', async () => {
    const { result } = renderHook(() => useSaveVideo());
    api.createSavedVideoThumbnail.mockRejectedValue(new Error('no frame'));
    await act(async () => {
      await result.current.replace(artifact('edited'), {
        videoId,
        currentVersionId: versionId,
      });
    });
    expect(api.appendSavedVideoVersion).toHaveBeenCalledOnce();
    // Both attempts failed, so no poster was uploaded — and the save still completed.
    expect(api.createSavedVideoThumbnail).toHaveBeenCalledTimes(2);
    expect(api.saveSavedVideoThumbnail).not.toHaveBeenCalled();
    expect(result.current.state.status).toBe('saved');

    api.saveVideo.mockRejectedValueOnce(new Error('disk unavailable'));
    await act(async () => {
      await result.current.save(artifact());
    });
    expect(result.current.state).toMatchObject({
      status: 'error',
      message: 'disk unavailable',
    });

    act(() => result.current.reset());
    expect(result.current.state).toEqual({ status: 'idle' });
  });

  it('retries a transient thumbnail failure once and uploads the retried poster', async () => {
    const { result } = renderHook(() => useSaveVideo());
    api.createSavedVideoThumbnail
      .mockRejectedValueOnce(new Error('decoder busy'))
      .mockResolvedValue(new Blob(['thumbnail'], { type: 'image/webp' }));

    await act(async () => {
      await result.current.save(artifact());
    });

    expect(api.createSavedVideoThumbnail).toHaveBeenCalledTimes(2);
    expect(api.saveSavedVideoThumbnail).toHaveBeenCalledOnce();
    expect(result.current.state.status).toBe('saved');
  });

  it('honours the requested poster source, using an uploaded image without decoding video', async () => {
    const { result } = renderHook(() => useSaveVideo());
    const image = new File(['poster'], 'poster.png', { type: 'image/png' });

    await act(async () => {
      await result.current.save(artifact(), { thumbnail: { kind: 'first-frame' } });
    });
    expect(api.createSavedVideoThumbnail.mock.calls[0]?.[2]).toBe('first');

    await act(async () => {
      await result.current.save(artifact(), { thumbnail: { kind: 'image', file: image } });
    });
    expect(api.createSavedVideoThumbnailFromImage).toHaveBeenCalledWith(image, expect.anything());
    expect(api.createSavedVideoThumbnail).toHaveBeenCalledOnce();
    expect(api.saveSavedVideoThumbnail).toHaveBeenCalledTimes(2);
  });

  it('selects direct multipart adapters only when the server capability enables them', async () => {
    const { result } = renderHook(() => useSaveVideo(true));

    await act(async () => {
      await result.current.save(artifact());
      await result.current.replace(artifact('edited'), {
        videoId,
        currentVersionId: versionId,
      });
    });

    expect(api.saveVideoDirect).toHaveBeenCalledOnce();
    expect(api.appendSavedVideoVersionDirect).toHaveBeenCalledOnce();
    expect(api.saveVideo).not.toHaveBeenCalled();
    expect(api.appendSavedVideoVersion).not.toHaveBeenCalled();
  });

  it('invalidates saved-video metadata after save and replace, but not after failure', async () => {
    const { result, queryClient } = renderHook(() => useSaveVideo());
    const listKey = [...savedVideoQueryKeys.lists, { sort: 'latest' }] as const;
    const seedList = () => queryClient.setQueryData(listKey, { videos: [] });

    seedList();
    await act(async () => {
      await result.current.save(artifact());
    });
    expect(queryClient.getQueryState(listKey)?.isInvalidated).toBe(true);

    seedList();
    await act(async () => {
      await result.current.replace(artifact('edited'), {
        videoId,
        currentVersionId: versionId,
      });
    });
    expect(queryClient.getQueryState(listKey)?.isInvalidated).toBe(true);

    seedList();
    api.saveVideo.mockRejectedValueOnce(new Error('disk unavailable'));
    await act(async () => {
      await result.current.save(artifact());
    });
    expect(queryClient.getQueryState(listKey)?.isInvalidated).toBe(false);
  });

  it('coalesces same-tick save attempts before React publishes the saving state', async () => {
    let resolve!: (value: SavedVideoDetail) => void;
    api.saveVideo.mockReturnValueOnce(
      new Promise<SavedVideoDetail>((settle) => {
        resolve = settle;
      }),
    );
    const { result } = renderHook(() => useSaveVideo());
    const source = artifact();

    let first!: Promise<SavedVideoDetail | null>;
    let second!: Promise<SavedVideoDetail | null>;
    act(() => {
      first = result.current.save(source);
      second = result.current.save(source);
    });
    await expect(second).resolves.toBeNull();
    expect(api.saveVideo).toHaveBeenCalledOnce();

    resolve(savedVideo);
    await act(async () => {
      await first;
    });
  });
});
