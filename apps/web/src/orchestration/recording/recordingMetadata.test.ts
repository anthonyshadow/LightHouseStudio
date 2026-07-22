// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
  captureTakeMetadata,
  captureTrackMeasurements,
  domainAudioSource,
  domainVideoSource,
} from './recordingMetadata';

const track = (
  settings: MediaTrackSettings,
  capabilities: MediaTrackCapabilities,
  label = '  Studio Camera  ',
): MediaStreamTrack =>
  ({
    label,
    getSettings: () => settings,
    getCapabilities: () => capabilities,
  }) as MediaStreamTrack;

describe('recording metadata', () => {
  it('prefers measured settings and accepts only fixed capability ranges', () => {
    expect(
      captureTrackMeasurements(
        track(
          { width: 1920, frameRate: 29.97 },
          { height: { min: 1080, max: 1080 }, width: { min: 640, max: 1920 } },
        ),
      ),
    ).toEqual({ width: 1920, height: 1080, frameRate: 29.97 });
  });

  it('omits inaccessible, invalid, and variable measurements', () => {
    const inaccessible = {
      get label() {
        throw new Error('blocked');
      },
      getSettings: () => {
        throw new Error('blocked');
      },
      getCapabilities: () => ({ width: { min: 1, max: 2 } }),
    } as unknown as MediaStreamTrack;
    expect(captureTrackMeasurements(inaccessible)).toEqual({});
    expect(
      captureTakeMetadata(
        { stream: {} as MediaStream, videoSource: 'local', audioSource: 'microphone' },
        'local',
        new Date('2026-07-22T12:00:00.000Z'),
        inaccessible,
        null,
      ),
    ).toEqual({
      mode: 'local',
      startedAt: '2026-07-22T12:00:00.000Z',
      videoSource: 'local',
      audioSource: 'none',
    });
  });

  it('builds immutable take metadata and maps domain sources', () => {
    const metadata = captureTakeMetadata(
      { stream: {} as MediaStream, videoSource: 'transformed', audioSource: 'provider' },
      'lucy-2.5',
      new Date('2026-07-22T12:00:00.000Z'),
      track({ width: 1280, height: 720 }, {}, ' Output '),
      track({}, {}, ' Voice '),
    );
    expect(metadata).toMatchObject({
      videoSourceLabel: 'Output',
      audioSourceLabel: 'Voice',
      audioSource: 'provider',
    });
    expect(Object.isFrozen(metadata)).toBe(true);
    expect(domainVideoSource('transformed')).toBe('model-output');
    expect(domainVideoSource('local')).toBe('local-camera');
    expect(domainAudioSource('provider')).toBe('model-output');
    expect(domainAudioSource('microphone')).toBe('local-microphone');
    expect(domainAudioSource('none')).toBe('none');
  });
});
