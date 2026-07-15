import type { RecordingLifecycle } from '../features/recording';
import type { StudioMode } from '../features/media-session';

export const canReplaceDirtyLibraryMode = (
  dirty: boolean,
  confirmDiscard: () => boolean,
): boolean => !dirty || confirmDiscard();

export const shouldFinalizeForUnusableModelOutput = (
  lifecycle: RecordingLifecycle,
  mode: StudioMode,
  transformedVideoUsable: boolean,
): boolean => lifecycle === 'recording' && mode !== 'local' && !transformedVideoUsable;
