import type { ProjectMediaReference } from './types';

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
