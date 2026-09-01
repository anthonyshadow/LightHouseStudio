import type { ProjectExportSpecification, ProjectMediaReference } from './types';

export const projectMediaReferencesEqual = (
  left: ProjectMediaReference | null,
  right: ProjectMediaReference | null,
): boolean => {
  if (left === null || right === null) return left === right;
  if (left.kind === 'asset') return right.kind === 'asset' && left.assetId === right.assetId;
  return (
    right.kind === 'saved-video-version' &&
    left.savedVideoId === right.savedVideoId &&
    left.videoVersionId === right.videoVersionId
  );
};

/**
 * Whether two placements would produce the same bytes.
 *
 * Every field counts, not just the aspect: the resolution is what a render is actually bounded to,
 * and a stored rendition may carry one no current canonical placement would choose. A surface asks
 * this to decide whether re-framing is work at all — where the answer is "same", the file already
 * on the server is the answer.
 */
export const projectExportSpecificationsEqual = (
  left: ProjectExportSpecification | null,
  right: ProjectExportSpecification | null,
): boolean => {
  if (left === null || right === null) return left === right;
  return (
    left.container === right.container &&
    left.aspect === right.aspect &&
    left.includeAudio === right.includeAudio &&
    left.resolution?.width === right.resolution?.width &&
    left.resolution?.height === right.resolution?.height
  );
};
