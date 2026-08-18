import type { CapturePreferences } from '../../application/types';
import { createVersionedRecordStore } from '../../persistence/versionedRecord';
import { LOCAL_MEDIA_PROFILES } from './mediaRequirements';

const isCapturePreferences = (value: unknown): value is CapturePreferences => {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  const optionalId = (id: unknown): boolean => id === null || typeof id === 'string';
  return (
    optionalId(candidate.videoDeviceId) &&
    optionalId(candidate.audioDeviceId) &&
    typeof candidate.profile === 'string' &&
    Object.hasOwn(LOCAL_MEDIA_PROFILES, candidate.profile) &&
    (candidate.aspectRatio === '16:9' || candidate.aspectRatio === '9:16')
  );
};

/**
 * The operator's chosen camera, microphone, capture profile and aspect ratio.
 *
 * Persisted because the Studio runtime is torn down on leaving Studio, and nothing about a device
 * choice is transient — losing it means re-picking the same camera on every visit. Device ids are
 * validated against the live device list before use, so a stale one degrades to the default rather
 * than failing capture; profiles are checked against the requirement table so adding one there
 * carries here for free.
 */
const store = createVersionedRecordStore<CapturePreferences>({
  storageBase: 'lightframe.capture-preferences',
  version: 1,
  parse: (payload) => (isCapturePreferences(payload) ? payload : null),
});

export const capturePreferencesStorageKey = store.storageKey;
export const loadCapturePreferences = store.load;
export const persistCapturePreferences = store.save;
