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
