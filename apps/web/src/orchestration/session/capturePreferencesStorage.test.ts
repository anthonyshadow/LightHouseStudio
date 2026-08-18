// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import {
  capturePreferencesStorageKey,
  loadCapturePreferences,
  persistCapturePreferences,
} from './capturePreferencesStorage';

const ownerUserId = '2d7914b2-f912-4b96-b17d-54100a2ffea3';

afterEach(() => window.localStorage.clear());

describe('capture preference persistence', () => {
  it('restores the operator’s applied choices across a Studio teardown', () => {
    const preferences = {
      videoDeviceId: 'camera-2',
      audioDeviceId: 'mic-1',
      profile: '1080p30',
      aspectRatio: '9:16',
    } as const;

    expect(persistCapturePreferences(ownerUserId, preferences)).toBe(true);
    expect(loadCapturePreferences(ownerUserId)).toEqual(preferences);
  });

  it('scopes storage to the operator, so a second account starts from defaults', () => {
    persistCapturePreferences(ownerUserId, {
      videoDeviceId: 'camera-2',
      audioDeviceId: null,
      profile: '720p30',
      aspectRatio: '16:9',
    });

    expect(loadCapturePreferences('a-different-user')).toBeNull();
    expect(capturePreferencesStorageKey(ownerUserId)).not.toBe(
      capturePreferencesStorageKey('a-different-user'),
    );
  });

  it.each([
    ['absent', null],
    ['unparseable', '{'],
    ['a future version', JSON.stringify({ version: 2, preferences: {} })],
    [
      'a profile this build does not know',
      JSON.stringify({
        version: 1,
        preferences: {
          videoDeviceId: null,
          audioDeviceId: null,
          profile: '4k120',
          aspectRatio: '16:9',
        },
      }),
    ],
  ])('falls back to defaults when the stored value is %s', (_label, raw) => {
    if (raw !== null) window.localStorage.setItem(capturePreferencesStorageKey(ownerUserId), raw);

    // Null means "no opinion", which the caller turns into this viewport's defaults. Anything else
    // would hand a half-understood value to getUserMedia.
    expect(loadCapturePreferences(ownerUserId)).toBeNull();
  });
});
