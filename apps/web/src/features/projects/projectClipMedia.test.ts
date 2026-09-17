import type { ProjectSourceCollectionItem } from '@studio/contracts';
import { projectMediaReferenceKey } from '@studio/domain';
import { describe, expect, it } from 'vitest';
import { clipMediaOf, projectClipMediaCatalogue, projectSourceReference } from './projectClipMedia';
import type { CurrentCut } from './useProjectCurrentCut';

const ids = {
  project: '18b120ac-1578-46e3-8c3d-42307772f391',
  revision: '89a972fe-bfb5-4214-94f7-4bd54f12ce06',
  original: '79b94c02-d268-4201-a05b-1f3baa0caed1',
  extra: '0f0e2d69-bb32-4f0a-9d3c-2a4c5f9c81aa',
  borrowed: '5d0c1c48-2b1e-4e6a-9f0b-7c3a2d1e0f9b',
  video: 'c26b5280-1538-44cd-82db-a6b1356acf62',
  version: '2efcc6c3-e82c-419a-8807-c0026170fb75',
  adopted: 'a3c5e7f9-1b2d-4c6e-8f0a-2b4d6e8f0a1c',
} as const;

const source = (
  assetId: string,
  overrides: Partial<ProjectSourceCollectionItem> = {},
): ProjectSourceCollectionItem => ({
  kind: 'uploaded',
  savedVideoId: null,
  videoVersionId: null,
  assetId,
  acceptedRevisionId: ids.revision,
  acceptedRevisionNumber: 2,
  mimeType: 'video/mp4',
  filename: `${assetId.slice(0, 4)}.mp4`,
  sizeBytes: 2_048,
  container: 'mp4',
  videoCodec: 'avc',
  audioCodec: null,
  durationMs: 12_000,
  width: 1_280,
  height: 720,
  hasAudio: false,
  acceptedAt: '2026-09-13T12:00:00.000Z',
  contentUrl: `/api/projects/${ids.project}/sources/${assetId}/content`,
  ...overrides,
});

const cut = (contentUrl: string, filename: string): CurrentCut => ({
  contentUrl,
  mimeType: 'video/mp4',
  filename,
  width: 1_080,
  height: 1_920,
  durationMs: 4_500,
  hasAudio: true,
});

const nothingPresented = { reference: null, cut: null } as const;

describe('projectSourceReference', () => {
  it('addresses a borrowed Library Version as that Version, and anything else as its asset', () => {
    expect(
      projectSourceReference(
        source(ids.borrowed, {
          kind: 'saved-video-version',
          savedVideoId: ids.video,
          videoVersionId: ids.version,
        }),
      ),
    ).toEqual({
      kind: 'saved-video-version',
      savedVideoId: ids.video,
      videoVersionId: ids.version,
    });
    expect(projectSourceReference(source(ids.extra))).toEqual({
      kind: 'asset',
      assetId: ids.extra,
    });
  });
});

describe('projectClipMediaCatalogue', () => {
  it('lists every held source in the collection’s order, each with the reference a clip would name', () => {
    const catalogue = projectClipMediaCatalogue(
      [
        source(ids.original),
        source(ids.borrowed, {
          kind: 'saved-video-version',
          savedVideoId: ids.video,
          videoVersionId: ids.version,
        }),
        source(ids.extra),
      ],
      nothingPresented,
    );
    expect(
      [...catalogue.values()].map(({ reference, media }) => [reference, media.filename]),
    ).toEqual([
      [{ kind: 'asset', assetId: ids.original }, '79b9.mp4'],
      [
        { kind: 'saved-video-version', savedVideoId: ids.video, videoVersionId: ids.version },
        '5d0c.mp4',
      ],
      [{ kind: 'asset', assetId: ids.extra }, '0f0e.mp4'],
    ]);
    // The media is the cut's projection: where the bytes are and what frame they have, never more.
    expect(clipMediaOf(catalogue, { kind: 'asset', assetId: ids.extra })).toEqual({
      contentUrl: `/api/projects/${ids.project}/sources/${ids.extra}/content`,
      mimeType: 'video/mp4',
      filename: '0f0e.mp4',
      width: 1_280,
      height: 720,
      durationMs: 12_000,
      hasAudio: false,
    });
  });

  it('lets the presented cut describe a source it is also held as, without moving it', () => {
    const presented = cut(
      `/api/projects/${ids.project}/sources/${ids.original}/content`,
      'cut.mp4',
    );
    // The presented source first, so a catalogue that re-appended it would come out the other way.
    const catalogue = projectClipMediaCatalogue([source(ids.original), source(ids.extra)], {
      reference: { kind: 'asset', assetId: ids.original },
      cut: presented,
    });
    expect([...catalogue.values()].map(({ media }) => media.filename)).toEqual([
      'cut.mp4',
      '0f0e.mp4',
    ]);
    // As it came, so it compares equal to the object the query cache holds.
    expect(clipMediaOf(catalogue, { kind: 'asset', assetId: ids.original })).toBe(presented);
  });

  it('appends a presented cut the collection never held — an adopted result — after the sources', () => {
    const adopted = cut(`/api/projects/${ids.project}/working-media/content`, 'adopted.mp4');
    const catalogue = projectClipMediaCatalogue([source(ids.original)], {
      reference: { kind: 'asset', assetId: ids.adopted },
      cut: adopted,
    });
    expect([...catalogue.keys()]).toEqual([
      projectMediaReferenceKey({ kind: 'asset', assetId: ids.original }),
      projectMediaReferenceKey({ kind: 'asset', assetId: ids.adopted }),
    ]);
    // Derived: nothing in the collection explains it, so the arrangement may be seeded over it but
    // it must not be offered as a clip to add.
    expect(
      catalogue.get(projectMediaReferenceKey({ kind: 'asset', assetId: ids.adopted })),
    ).toEqual({
      reference: { kind: 'asset', assetId: ids.adopted },
      media: adopted,
      derived: true,
    });
  });

  it('answers null for media neither input explains, and ignores a presented reference without a cut', () => {
    const catalogue = projectClipMediaCatalogue([source(ids.original)], {
      reference: { kind: 'asset', assetId: ids.adopted },
      cut: null,
    });
    expect(catalogue.size).toBe(1);
    expect(clipMediaOf(catalogue, { kind: 'asset', assetId: ids.adopted })).toBeNull();
  });
});
