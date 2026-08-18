import type { CapturePreferences } from '../../application/types';
import { environmentScopedPersistenceName } from '../../persistence/environmentScope';

const STORAGE_BASE = 'lightframe.capture-preferences.v1';

type CapturePreferencesEnvelope = Readonly<{
  version: 1;
  preferences: CapturePreferences;
}>;

export const capturePreferencesStorageKey = (ownerUserId: string): string =>
  environmentScopedPersistenceName(STORAGE_BASE, ownerUserId);

const isCapturePreferences = (value: unknown): value is CapturePreferences => {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  const optionalId = (id: unknown): boolean => id === null || typeof id === 'string';
  return (
    optionalId(candidate.videoDeviceId) &&
    optionalId(candidate.audioDeviceId) &&
    (candidate.profile === '720p30' || candidate.profile === '1080p30') &&
    (candidate.aspectRatio === '16:9' || candidate.aspectRatio === '9:16')
  );
};

/**
 * The operator's chosen camera, microphone, capture profile and aspect ratio.
 *
 * Persisted because the Studio runtime is torn down on leaving Studio, and nothing about a device
 * choice is transient — losing it means re-picking the same camera on every visit. Device ids are
 * validated against the live device list before use, so a stale one degrades to the default rather
 * than failing capture.
 */
export const loadCapturePreferences = (ownerUserId: string): CapturePreferences | null => {
  try {
    const raw = window.localStorage.getItem(capturePreferencesStorageKey(ownerUserId));
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      (parsed as { version?: unknown }).version !== 1
    ) {
      return null;
    }
    const { preferences } = parsed as { preferences?: unknown };
    return isCapturePreferences(preferences) ? preferences : null;
  } catch {
    return null;
  }
};

export const persistCapturePreferences = (
  ownerUserId: string,
  preferences: CapturePreferences,
): boolean => {
  const envelope: CapturePreferencesEnvelope = { version: 1, preferences };
  try {
    window.localStorage.setItem(
      capturePreferencesStorageKey(ownerUserId),
      JSON.stringify(envelope),
    );
    return true;
  } catch {
    return false;
  }
};
