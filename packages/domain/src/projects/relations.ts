import { projectMediaReferenceKey } from './media-reference';
import type { ProjectExportSpecification, ProjectMediaReference } from './types';

/**
 * Whether two references name the same media.
 *
 * Defined as the key comparison rather than beside it: a reference's identity had two encodings the
 * moment `projectMediaReferenceKey` existed, and two encodings of one idea drift — a third variant
 * added to one and not the other would make a catalogue lookup and this disagree about one pair.
 * Null handling stays here, because a key has nothing to say about an absent reference.
 */
export const projectMediaReferencesEqual = (
  left: ProjectMediaReference | null,
  right: ProjectMediaReference | null,
): boolean =>
  left === null || right === null
    ? left === right
    : projectMediaReferenceKey(left) === projectMediaReferenceKey(right);

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
