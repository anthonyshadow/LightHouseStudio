import { describe, expect, it } from 'vitest';
import { parseRecordingMemoryArguments } from './recording-memory-arguments.mjs';

const required = ['--duration-seconds', '300', '--main-mib-per-minute', '24'];

describe('parseRecordingMemoryArguments', () => {
  it('parses required values and applies bounded defaults', () => {
    expect(parseRecordingMemoryArguments(required)).toEqual({
      durationSeconds: 300,
      mainMiBPerMinute: 24,
      sidecarMiBPerMinute: 0,
      sampleRate: 48_000,
      channels: 2,
      processedOutputMultiplier: 1.1,
    });
  });

  it.each([
    [['--unknown', '1', ...required], 'Unknown option'],
    [[...required, '--duration-seconds', '20'], 'Duplicate option'],
    [['--duration-seconds', '1.5', '--main-mib-per-minute', '24'], 'Expected an integer'],
    [['--duration-seconds', '301', '--main-mib-per-minute', '24'], 'from 1 through 300'],
    [['--duration-seconds', '30'], 'Missing required option'],
    [[...required, '--channels'], 'Every option requires a value'],
  ])('rejects invalid arguments: %j', (arguments_, message) => {
    expect(() => parseRecordingMemoryArguments(arguments_)).toThrow(message);
  });
});
