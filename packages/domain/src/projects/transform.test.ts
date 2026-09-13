import { describe, expect, it } from 'vitest';
import {
  EMPTY_PROJECT_TRANSFORM,
  normalizeProjectTransform,
  projectTransformIsEmpty,
  projectTransformOf,
} from './transform';
import type { ProjectTransform } from './types';

const configured: ProjectTransform = {
  ...EMPTY_PROJECT_TRANSFORM,
  selectedCharacter: {
    characterId: 'character-one',
    characterLabel: 'Avery',
    characterRevision: '2026-08-11T12:00:00.000Z',
    variantId: null,
    variantLabel: null,
    variantRevision: null,
    referenceAssetId: null,
  },
  visualTreatment: { kind: 'character-swap', providerId: null, outputResolution: null },
};

describe('project transform canonical form', () => {
  it('states the empty transform in the contract key order', () => {
    expect(Object.keys(EMPTY_PROJECT_TRANSFORM)).toEqual([
      'selectedCharacter',
      'selectedOutfit',
      'selectedVoice',
      'visualTreatment',
      'creativeIntent',
    ]);
    expect(projectTransformIsEmpty(EMPTY_PROJECT_TRANSFORM)).toBe(true);
  });

  it('treats any configured field, including untrimmed intent, as non-empty', () => {
    expect(projectTransformIsEmpty(configured)).toBe(false);
    const intentOnly: ProjectTransform = {
      ...EMPTY_PROJECT_TRANSFORM,
      creativeIntent: { ...EMPTY_PROJECT_TRANSFORM.creativeIntent, userIntent: ' ' },
    };
    // The contract does not trim intent, so neither does emptiness; the two must agree.
    expect(projectTransformIsEmpty(intentOnly)).toBe(false);
    const voiceOnly: ProjectTransform = {
      ...EMPTY_PROJECT_TRANSFORM,
      selectedVoice: {
        kind: 'local-effect',
        effectId: 'warm-studio',
        effectRevision: 'builtin-v1',
      },
    };
    expect(projectTransformIsEmpty(voiceOnly)).toBe(false);
  });

  it('normalizes an empty transform to null and returns a configured one as itself', () => {
    expect(normalizeProjectTransform(null)).toBeNull();
    expect(normalizeProjectTransform({ ...EMPTY_PROJECT_TRANSFORM })).toBeNull();
    // Identity, not equality: a rebuilt object would reorder keys under the JSON comparisons.
    expect(normalizeProjectTransform(configured)).toBe(configured);
  });

  it('reads a null transform as the empty view without inventing a stored value', () => {
    expect(projectTransformOf({ transform: null })).toBe(EMPTY_PROJECT_TRANSFORM);
    expect(projectTransformOf({ transform: configured })).toBe(configured);
  });
});
