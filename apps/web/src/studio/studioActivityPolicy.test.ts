import { describe, expect, it } from 'vitest';
import { characterBuilderBlockedReasons } from './studioActivityPolicy';

const state = (overrides: Partial<Parameters<typeof characterBuilderBlockedReasons>[0]> = {}) =>
  characterBuilderBlockedReasons({
    recordingActive: false,
    finalizing: false,
    reviewLocked: false,
    ...overrides,
  });

describe('characterBuilderBlockedReasons', () => {
  it('asks an unsaved take to be settled before a character is built', () => {
    expect(state({ reviewLocked: true }).open).toBe(
      'Save and release or discard the current take before building a character.',
    );
  });

  it('never asks a durable configuration to discard media it is built from', () => {
    // A Project always presents its own source video, so `reviewLocked` is permanently true there.
    // Naming an action a Project does not have disabled Create Outfit in the panel offering it.
    expect(state({ reviewLocked: true, configurationIsDurable: true }).open).toBeUndefined();
  });

  it('still blocks a durable configuration while a take is being made', () => {
    expect(
      state({ reviewLocked: true, configurationIsDurable: true, recordingActive: true }).open,
    ).toBe('Finish recording and finalization before building a character.');
    expect(state({ reviewLocked: true, configurationIsDurable: true, finalizing: true }).open).toBe(
      'Wait for the current take to finish finalizing before building a character.',
    );
  });

  it('reports activity separately from the open gate, in both modes', () => {
    expect(state({ reviewLocked: true }).activity).toBeUndefined();
    expect(state({ recordingActive: true }).activity).toBe(
      'Finish recording and finalization before building a character.',
    );
  });
});
