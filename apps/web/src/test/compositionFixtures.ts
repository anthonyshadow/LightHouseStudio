import { projectMediaReferenceKey, type ProjectMediaReference } from '@studio/domain';
import type {
  ProjectClipMedia,
  ProjectClipMediaEntry,
} from '../features/projects/projectClipMedia';

/**
 * The one shape of a Project's media as an arrangement's suites need it.
 *
 * Stated once because it is a shape the product owns rather than a fact either suite is about:
 * `ProjectClipMediaEntry` pairs the reference a clip names with the media a player opens, and a
 * second hand-written copy of that pairing is a second thing to edit the next time it moves.
 */
export const clipMediaFixture = (
  projectId: string,
  assetId: string,
  filename: string,
  overrides: Partial<ProjectClipMedia> = {},
): ProjectClipMedia => ({
  contentUrl: `/api/projects/${projectId}/sources/${assetId}/content`,
  mimeType: 'video/mp4',
  filename,
  width: 1_920,
  height: 1_080,
  durationMs: 12_000,
  hasAudio: true,
  ...overrides,
});

/** One catalogue entry, keyed the way the catalogue keys it. */
export const clipMediaEntryFixture = (
  reference: ProjectMediaReference,
  media: ProjectClipMedia,
  derived = false,
): readonly [string, ProjectClipMediaEntry] => [
  projectMediaReferenceKey(reference),
  { reference, media, derived },
];
