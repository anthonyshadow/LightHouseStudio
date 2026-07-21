import { describe, expect, it } from 'vitest';
import { createNoopGuidedFlowTelemetry, createRecordingGuidedFlowTelemetry } from './telemetry';

describe('guided flow telemetry', () => {
  it('defaults to a side-effect-free no-op and offers an in-memory test recorder', () => {
    expect(() =>
      createNoopGuidedFlowTelemetry().track({
        type: 'guided-stage-viewed',
        stage: 'create',
        projectRevision: 0,
        timestamp: '2026-07-20T12:00:00.000Z',
      }),
    ).not.toThrow();

    const telemetry = createRecordingGuidedFlowTelemetry();
    telemetry.track({
      type: 'character-reference-mode-selected',
      mode: 'prompt-only',
      profile: 'non-binary',
      hasCustomChoices: true,
      projectRevision: 1,
      timestamp: '2026-07-20T12:01:00.000Z',
    });
    expect(telemetry.events).toEqual([
      expect.objectContaining({ type: 'character-reference-mode-selected', mode: 'prompt-only' }),
    ]);
    telemetry.clear();
    expect(telemetry.events).toEqual([]);
  });
});
