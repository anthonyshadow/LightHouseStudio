// @vitest-environment jsdom

import type { SavedVideoDetail, SavedVideoSummary } from '@studio/contracts';
import { describe, expect, it } from 'vitest';
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
import {
  captureRequests,
  galleryPaginationScenario,
  jsonScenario,
  responseScenario,
} from '../../test/msw/handlers';
import { mockApiServer } from '../../test/msw/server';

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
    exportSpecification: null,
    variantSetId: null,
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
detail.versions.push(detail.currentVersion);
const summary: SavedVideoSummary = {
  id: detail.id,
  title: detail.title,
  status: detail.status,
  currentVersion: detail.currentVersion,
  sourceVideoId: detail.sourceVideoId,
  versionCount: detail.versionCount,
  thumbnailAvailable: detail.thumbnailAvailable,
  revision: detail.revision,
  createdAt: detail.createdAt,
  updatedAt: detail.updatedAt,
};

describe('saved videos API client', () => {
  it('sends create, append, thumbnail, list, rename, and delete contracts', async () => {
    const { requests, observe } = captureRequests();
    mockApiServer.use(
      jsonScenario('POST', '/api/videos', { body: detail }, observe),
      jsonScenario('POST', `/api/videos/${videoId}/versions`, { body: detail }, observe),
      jsonScenario(
        'PUT',
        `/api/videos/${videoId}/versions/${versionId}/thumbnail`,
        { body: detail },
        observe,
      ),
      galleryPaginationScenario(
        {
          'next page': {
            videos: [summary],
            nextCursor: null,
            total: 1,
            facets: { characterNames: ['Mara'], formats: ['landscape'] },
          },
        },
        observe,
      ),
      jsonScenario('PATCH', `/api/videos/${videoId}`, { body: detail }, observe),
      responseScenario('DELETE', `/api/videos/${videoId}`, null, { status: 204 }, observe),
    );
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
    await expect(renameSavedVideo(videoId, 'Renamed', 1)).resolves.toEqual(detail);
    await expect(deleteSavedVideo(videoId)).resolves.toBeUndefined();

    const appendRequest = requests.find(
      (request) => new URL(request.url).pathname === `/api/videos/${videoId}/versions`,
    );
    expect(appendRequest?.headers.get('If-Match')).toBe(`"${versionId}"`);
    const listRequest = requests.find((request) => request.method === 'GET');
    expect(listRequest?.url).toContain('cursor=next+page');
    expect(listRequest?.url).toContain('characterName=Mara');
    expect(listRequest?.url).toContain('format=landscape');
    expect(listRequest?.url).toContain('sort=shortest');
    const createRequest = requests.find(
      (request) => request.method === 'POST' && new URL(request.url).pathname === '/api/videos',
    );
    const deleteRequest = requests.find((request) => request.method === 'DELETE');
    expect(deleteRequest?.headers.get('Content-Type')).toBe('application/json');
    await expect(deleteRequest?.text()).resolves.toBe('{}');
    expect(
      JSON.parse(decodeURIComponent(createRequest!.headers.get('X-Lightframe-Video-Metadata')!)),
    ).toMatchObject({ characterName: 'Mara', characterVariantName: 'Evening' });
  });

  it('builds owner-checked content, download, and thumbnail paths', () => {
    expect(savedVideoContentUrl(videoId)).toBe(`/api/videos/${videoId}/content`);
    expect(savedVideoContentUrl(videoId, versionId)).toBe(
      `/api/videos/${videoId}/versions/${versionId}/content`,
    );
    expect(downloadSavedVideoUrl(videoId)).toBe(`/api/videos/${videoId}/content?download=true`);
    expect(savedVideoThumbnailUrl(videoId, versionId)).toBe(
      `/api/videos/${videoId}/versions/${versionId}/thumbnail`,
    );
  });
});
