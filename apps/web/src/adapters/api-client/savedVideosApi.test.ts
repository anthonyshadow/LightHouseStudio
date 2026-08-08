// @vitest-environment jsdom

import type { SavedVideoDetail, SavedVideoSummary } from '@studio/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  appendSavedVideoVersion,
  deleteSavedVideo,
  downloadSavedVideoUrl,
  listSavedVideos,
  renameSavedVideo,
  saveSavedVideoThumbnail,
  savedVideoContentUrl,
  savedVideoThumbnailUrl,
  saveVideo,
} from './savedVideosApi';

const videoId = 'c26b5280-1538-44cd-82db-a6b1356acf62';
const versionId = '2efcc6c3-e82c-419a-8807-c0026170fb75';
const detail: SavedVideoDetail = {
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
    sizeBytes: 1_024,
    durationMs: 12_000,
    width: 1_280,
    height: 720,
    createdAt: '2026-08-05T12:00:00.000Z',
  },
  sourceVideoId: null,
  versionCount: 1,
  thumbnailAvailable: false,
  createdAt: '2026-08-05T12:00:00.000Z',
  updatedAt: '2026-08-05T12:00:00.000Z',
  versions: [],
};
detail.versions.push(detail.currentVersion);
const summary: SavedVideoSummary = {
  id: detail.id,
  title: detail.title,
  status: detail.status,
  currentVersion: detail.currentVersion,
  sourceVideoId: detail.sourceVideoId,
  versionCount: detail.versionCount,
  thumbnailAvailable: detail.thumbnailAvailable,
  createdAt: detail.createdAt,
  updatedAt: detail.updatedAt,
};

const jsonResponse = (value: unknown): Response =>
  new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

describe('saved videos API client', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends create, append, thumbnail, list, rename, and delete contracts', async () => {
    const fetchMock = vi.fn<typeof fetch>((input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      return Promise.resolve(
        url.startsWith('/api/videos?')
          ? jsonResponse({
              videos: [summary],
              nextCursor: null,
              total: 1,
              facets: { characterNames: ['Mara'], formats: ['landscape'] },
            })
          : url === `/api/videos/${videoId}`
            ? jsonResponse(detail)
            : jsonResponse(detail),
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    const blob = new Blob(['video'], { type: 'video/mp4' });
    const input = {
      blob,
      title: 'Morning take',
      filename: 'morning-take.mp4',
      origin: 'recorded' as const,
      characterName: 'Mara',
      characterVariantName: 'Evening',
      idempotencyKey: '0d4ec50f-28fe-45e8-ad0d-f34b96482b47',
    };

    await expect(saveVideo(input)).resolves.toEqual(detail);
    await expect(appendSavedVideoVersion(videoId, versionId, input)).resolves.toEqual(detail);
    await expect(
      saveSavedVideoThumbnail(videoId, versionId, new Blob(['image'], { type: 'image/webp' })),
    ).resolves.toEqual(detail);
    await expect(
      listSavedVideos({
        cursor: 'next page',
        characterName: 'Mara',
        format: 'landscape',
        sort: 'shortest',
      }),
    ).resolves.toEqual({
      videos: [summary],
      nextCursor: null,
      total: 1,
      facets: { characterNames: ['Mara'], formats: ['landscape'] },
    });
    await expect(renameSavedVideo(videoId, 'Renamed')).resolves.toEqual(detail);
    await expect(deleteSavedVideo(videoId)).resolves.toBeUndefined();

    const appendCall = fetchMock.mock.calls[1];
    expect(appendCall?.[0]).toBe(`/api/videos/${videoId}/versions`);
    expect(new Headers(appendCall?.[1]?.headers).get('If-Match')).toBe(`"${versionId}"`);
    expect(fetchMock.mock.calls[3]?.[0]).toContain('cursor=next+page');
    expect(fetchMock.mock.calls[3]?.[0]).toContain('characterName=Mara');
    expect(fetchMock.mock.calls[3]?.[0]).toContain('format=landscape');
    expect(fetchMock.mock.calls[3]?.[0]).toContain('sort=shortest');
    expect(
      JSON.parse(
        decodeURIComponent(
          new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get('X-Lightframe-Video-Metadata')!,
        ),
      ),
    ).toMatchObject({ characterName: 'Mara', characterVariantName: 'Evening' });
  });

  it('builds owner-checked content, download, and thumbnail paths', () => {
    expect(savedVideoContentUrl(videoId)).toBe(`/api/videos/${videoId}/content`);
    expect(savedVideoContentUrl(videoId, versionId)).toBe(
      `/api/videos/${videoId}/versions/${versionId}/content`,
    );
    expect(downloadSavedVideoUrl(videoId)).toBe(`/api/videos/${videoId}/content?download=true`);
    expect(savedVideoThumbnailUrl(videoId)).toBe(`/api/videos/${videoId}/thumbnail`);
  });
});
