import type { VideoTransformOperationId } from '@studio/contracts';

/**
 * The one user-facing name for each provider visual operation. Every surface that labels an
 * operation id — tool cards, job queues, processing status, history — reads from here so the
 * product cannot ship two spellings of the same capability again.
 */
export const VIDEO_TRANSFORM_OPERATION_LABELS: Record<VideoTransformOperationId, string> = {
  'character-swap': 'Character Swap',
  'virtual-try-on': 'Virtual Try-On',
};

/**
 * What each operation does, in one sentence. Shares an owner with the labels for the same reason:
 * the editor's tool cards and the Project Create launchers describe the same two capabilities, and
 * two descriptions of one operation is two things to keep true.
 */
export const VIDEO_TRANSFORM_OPERATION_DESCRIPTIONS: Record<VideoTransformOperationId, string> = {
  'character-swap': 'Replace the visible person or character.',
  'virtual-try-on': 'Change the subject’s clothing with one garment.',
};

/** Why a visual operation cannot run at all in this deployment. */
export const VIDEO_TRANSFORM_UNAVAILABLE_REASON =
  'This visual operation is unavailable in the current server configuration.';

/** Why this exact video cannot reach a visual provider, when the provider itself is configured. */
export const VIDEO_TRANSFORM_INCOMPATIBLE_REASON =
  'This aspect ratio is unavailable for visual AI.';
