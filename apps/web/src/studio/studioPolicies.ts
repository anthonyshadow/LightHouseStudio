import type { RecordingLifecycle } from '../features/recording';
import type { StudioMode } from '../features/media-session';
export { canReplaceDirtyLibraryMode } from '../features/creative-assets/useRecipeLibraryMode';

export const REVIEW_LOCK_REASON =
  'Save and release or discard the temporary take before starting or changing media.';

export const shouldFinalizeForUnusableModelOutput = (
  lifecycle: RecordingLifecycle,
  mode: StudioMode,
  transformedVideoUsable: boolean,
): boolean => lifecycle === 'recording' && mode !== 'local' && !transformedVideoUsable;
