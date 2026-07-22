import { describe, expect, it } from 'vitest';
import { CHARACTER_REFERENCE_FRAMINGS, SUPPORTED_MODEL_IDS } from '@studio/contracts';
import { CHARACTER_REFERENCE_PROMPT_FRAMINGS, MODEL_MODE_IDS } from '@studio/domain';

describe('independent domain and wire value sets', () => {
  it('keeps realtime model identifiers in parity', () => {
    expect(MODEL_MODE_IDS).toEqual(SUPPORTED_MODEL_IDS);
  });

  it('keeps reference framing identifiers in parity', () => {
    expect(CHARACTER_REFERENCE_PROMPT_FRAMINGS).toEqual(CHARACTER_REFERENCE_FRAMINGS);
  });
});
