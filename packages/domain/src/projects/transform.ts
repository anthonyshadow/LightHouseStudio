import type { ProjectSnapshot, ProjectTransform } from './types';

/**
 * The transform with nothing configured, in the contract's key order — the order is load-bearing,
 * because the stored snapshot and the incoming proposal are compared as JSON in both apps. A plain
 * object, not frozen, for the bundle reason recorded beside the video-editing defaults.
 */
export const EMPTY_PROJECT_TRANSFORM: ProjectTransform = {
  selectedCharacter: null,
  selectedOutfit: null,
  selectedVoice: null,
  visualTreatment: { kind: 'none' },
  creativeIntent: {
    promptId: null,
    promptLabel: null,
    recipeId: null,
    recipeLabel: null,
    userIntent: '',
    appliedPrompt: null,
    referenceAssetId: null,
    resourceRevision: null,
  },
};

/**
 * Whether a transform configures nothing. Intent is compared untrimmed, because the contract does
 * not trim it either; the two must agree on what "empty" is.
 */
export const projectTransformIsEmpty = (transform: ProjectTransform): boolean => {
  const intent = transform.creativeIntent;
  return (
    transform.selectedCharacter === null &&
    transform.selectedOutfit === null &&
    transform.selectedVoice === null &&
    transform.visualTreatment.kind === 'none' &&
    intent.promptId === null &&
    intent.promptLabel === null &&
    intent.recipeId === null &&
    intent.recipeLabel === null &&
    intent.userIntent === '' &&
    intent.appliedPrompt === null &&
    intent.referenceAssetId === null &&
    intent.resourceRevision === null
  );
};

/**
 * The canonical form: an empty transform is `null`, and a non-empty one is returned as itself —
 * never rebuilt, because a rebuilt literal would reorder keys and a no-op checkpoint would then
 * read as a material change and drop the Project's output pointer.
 */
export const normalizeProjectTransform = (
  transform: ProjectTransform | null,
): ProjectTransform | null =>
  transform === null || projectTransformIsEmpty(transform) ? null : transform;

/**
 * The transform as a reader sees it: the snapshot's own, or the empty one when nothing is
 * configured. For reading only — an equality must compare `snapshot.transform` itself, so that
 * `null` and the empty view never sit on opposite sides of it.
 */
export const projectTransformOf = (
  snapshot: Pick<ProjectSnapshot, 'transform'>,
): ProjectTransform => snapshot.transform ?? EMPTY_PROJECT_TRANSFORM;
