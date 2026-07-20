import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_WORKSHOP_REFERENCE_PREFERENCES,
  WORKSHOP_REFERENCE_PREFERENCES_STORAGE_KEY,
  createOptimizerReferenceOptions,
  createWorkshopOptimizationKey,
  isCustomBackgroundMissing,
  loadWorkshopReferencePreferences,
  normalizeWorkshopReferenceOptions,
  saveWorkshopReferencePreferences,
  sanitizeWorkshopReferencePreferences,
} from './referenceOptimization';

describe('workshop reference optimization preferences', () => {
  it('falls back to optimization-on defaults for corrupt or unknown persisted values', () => {
    expect(sanitizeWorkshopReferencePreferences(null)).toEqual(
      DEFAULT_WORKSHOP_REFERENCE_PREFERENCES,
    );
    expect(
      sanitizeWorkshopReferencePreferences({
        schemaVersion: 1,
        optimizePrompt: false,
        options: { framing: 'invented' },
      }),
    ).toEqual(DEFAULT_WORKSHOP_REFERENCE_PREFERENCES);
    expect(
      loadWorkshopReferencePreferences({
        getItem: () => '{not-json',
        setItem: vi.fn(),
      }),
    ).toEqual(DEFAULT_WORKSHOP_REFERENCE_PREFERENCES);
  });

  it('persists only allowlisted reference preferences and tolerates unavailable storage', () => {
    const setItem = vi.fn();
    saveWorkshopReferencePreferences(
      {
        optimizePrompt: false,
        options: {
          ...DEFAULT_WORKSHOP_REFERENCE_PREFERENCES.options,
          framing: 'full_body',
        },
      },
      { getItem: vi.fn(), setItem },
    );

    expect(setItem).toHaveBeenCalledWith(
      WORKSHOP_REFERENCE_PREFERENCES_STORAGE_KEY,
      expect.not.stringMatching(/rawPrompt|optimizedImagePrompt|lucy25CharacterPrompt/u),
    );
    expect(() =>
      saveWorkshopReferencePreferences(DEFAULT_WORKSHOP_REFERENCE_PREFERENCES, {
        getItem: vi.fn(),
        setItem: () => {
          throw new DOMException('Blocked', 'SecurityError');
        },
      }),
    ).not.toThrow();
  });

  it('keys raw prompt, every reference option, and optimizer model/version deterministically', () => {
    const defaults = DEFAULT_WORKSHOP_REFERENCE_PREFERENCES.options;
    const base = createWorkshopOptimizationKey(
      '  midnight   botanist ',
      defaults,
      'gpt-5.6',
      'lucy-character-reference-v1',
      { provider: 'openai', model: 'gpt-image-2' },
    );

    expect(
      createWorkshopOptimizationKey(
        'midnight botanist',
        defaults,
        'gpt-5.6',
        'lucy-character-reference-v1',
        { provider: 'openai', model: 'gpt-image-2' },
      ),
    ).toBe(base);
    expect(
      createWorkshopOptimizationKey(
        'midnight botanist',
        { ...defaults, expression: 'subtle_friendly' },
        'gpt-5.6',
        'lucy-character-reference-v1',
        { provider: 'openai', model: 'gpt-image-2' },
      ),
    ).not.toBe(base);
    expect(
      createWorkshopOptimizationKey(
        'midnight botanist',
        defaults,
        'gpt-5.6',
        'lucy-character-reference-v2',
        { provider: 'openai', model: 'gpt-image-2' },
      ),
    ).not.toBe(base);
    expect(
      createWorkshopOptimizationKey(
        'midnight botanist',
        defaults,
        'gpt-5.6',
        'lucy-character-reference-v1',
        { provider: 'openai', model: 'gpt-image-3' },
      ),
    ).not.toBe(base);

    const customSpaced = createWorkshopOptimizationKey(
      'midnight botanist',
      { ...defaults, background: 'plain_custom', customBackground: 'muted  blue' },
      'gpt-5.6',
      'lucy-character-reference-v1',
      { provider: 'openai', model: 'gpt-image-2' },
    );
    expect(
      createWorkshopOptimizationKey(
        'midnight botanist',
        { ...defaults, background: 'plain_custom', customBackground: 'muted blue' },
        'gpt-5.6',
        'lucy-character-reference-v1',
        { provider: 'openai', model: 'gpt-image-2' },
      ),
    ).toBe(customSpaced);
  });

  it('normalizes one canonical option shape for optimization requests and freshness keys', () => {
    const customOptions = {
      ...DEFAULT_WORKSHOP_REFERENCE_PREFERENCES.options,
      background: 'plain_custom' as const,
      customBackground: '  muted   blue  ',
    };

    expect(normalizeWorkshopReferenceOptions(customOptions)).toEqual({
      ...DEFAULT_WORKSHOP_REFERENCE_PREFERENCES.options,
      background: 'plain_custom',
      customBackground: 'muted blue',
    });
    expect(createOptimizerReferenceOptions(customOptions)).toEqual({
      ...DEFAULT_WORKSHOP_REFERENCE_PREFERENCES.options,
      background: 'plain_custom',
      customBackground: 'muted blue',
      targetUse: 'lucy_2_5_character_reference',
    });
    expect(isCustomBackgroundMissing({ ...customOptions, customBackground: '   ' })).toBe(true);
    expect(
      createOptimizerReferenceOptions({
        ...customOptions,
        background: 'neutral_gray',
      }),
    ).not.toHaveProperty('customBackground');
  });
});
