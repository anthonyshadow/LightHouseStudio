import { describe, expect, it } from 'vitest';
import { createNoopStudioTelemetry, createRecordingStudioTelemetry } from './telemetry';

describe('Studio telemetry', () => {
  it('is no-op by default and records metadata-only Studio views for tests', () => {
    const event = {
      type: 'studio-viewed' as const,
      canonicalPath: '/' as const,
      canonicalizedLegacyEntry: true,
      initialOverlay: 'legacy-projects' as const,
      timestamp: '2026-07-21T12:00:00.000Z',
    };
    expect(() => createNoopStudioTelemetry().track(event)).not.toThrow();

    const telemetry = createRecordingStudioTelemetry();
    telemetry.track(event);
    expect(telemetry.events).toEqual([event]);
    telemetry.clear();
    expect(telemetry.events).toEqual([]);
  });
});
