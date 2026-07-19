import { describe, expect, it } from 'vitest';
import { BUILDER_DETAIL_MAX_LENGTH } from '../common/text';
import {
  buildCharacterReferenceImagePrompt,
  characterReferencePromptHashInput,
  createPromptBuilderDraft,
  generateStructuredPrompt,
  sanitizePromptBuilderDraft,
  validatePromptBuilderDraft,
  type PromptBuilderDraft,
} from './index';

describe('structured prompt generation', () => {
  it('generates Character text only from visible choices and omits empty fields', () => {
    const draft: PromptBuilderDraft = {
      ...createPromptBuilderDraft('character-transform'),
      intent: 'character-transform',
      adultAge: 'older-adult',
      gender: 'woman',
      characterBase: 'lunar cartographer',
      matchReference: true,
      outfit: 'indigo utility suit',
      preserve: 'hand gestures',
    };
    const result = generateStructuredPrompt(draft, { hasReferenceImage: true });
    expect(result.validation.valid).toBe(true);
    expect(result.prompt).toBe(
      'Substitute the character in the video with older adult woman lunar cartographer. Match the provided portrait reference. Outfit: indigo utility suit. Preserve: hand gestures.',
    );
    expect(result.prompt).not.toContain('Hair:');
  });

  it.each([
    [
      {
        ...createPromptBuilderDraft('add-object'),
        intent: 'add-object' as const,
        objectDescription: 'a small brass compass',
        placement: 'on the desk beside the notebook',
      },
      'Add a small brass compass. Placement: on the desk beside the notebook.',
    ],
    [
      {
        ...createPromptBuilderDraft('replace-object'),
        intent: 'replace-object' as const,
        target: 'ceramic mug',
        replacementDescription: 'a clear glass tumbler',
      },
      'Replace the visible ceramic mug with a clear glass tumbler.',
    ],
    [
      {
        ...createPromptBuilderDraft('change-attribute'),
        intent: 'change-attribute' as const,
        target: 'jacket',
        attribute: 'material',
        newValue: 'soft green velvet',
      },
      "Change the jacket's material to soft green velvet.",
    ],
  ])('generates each object-edit intent', (draft, expected) => {
    expect(generateStructuredPrompt(draft).prompt).toBe(expected);
  });
});

describe('structured prompt validation', () => {
  it('enforces every intent-specific blocking rule', () => {
    expect(
      validatePromptBuilderDraft(
        createPromptBuilderDraft('character-transform'),
      ).blockingIssues.map(({ code }) => code),
    ).toContain('character-detail-required');
    expect(
      validatePromptBuilderDraft(createPromptBuilderDraft('add-object')).blockingIssues.map(
        ({ code }) => code,
      ),
    ).toEqual(['object-description-required', 'placement-required']);
    expect(
      validatePromptBuilderDraft(createPromptBuilderDraft('replace-object')).blockingIssues.map(
        ({ code }) => code,
      ),
    ).toEqual(['target-required', 'replacement-description-required']);
    expect(
      validatePromptBuilderDraft(createPromptBuilderDraft('change-attribute')).blockingIssues.map(
        ({ code }) => code,
      ),
    ).toEqual(['target-required', 'new-value-required']);
  });

  it('blocks minor descriptions and overly long custom details', () => {
    const draft = {
      ...createPromptBuilderDraft('character-transform'),
      intent: 'character-transform' as const,
      characterBase: '16-year-old explorer',
      customDetails: 'x'.repeat(BUILDER_DETAIL_MAX_LENGTH + 1),
    };
    expect(validatePromptBuilderDraft(draft).blockingIssues.map(({ code }) => code)).toEqual(
      expect.arrayContaining(['minor-description-not-allowed', 'custom-details-too-long']),
    );
    expect(generateStructuredPrompt(draft).prompt).toBe('');
  });

  it.each(['age 17 explorer', '17yo explorer', '17 yo explorer', 'aged 12 explorer'])(
    'blocks an explicit minor age written as %s',
    (characterBase) => {
      const draft = {
        ...createPromptBuilderDraft('character-transform'),
        characterBase,
      };

      expect(validatePromptBuilderDraft(draft).blockingIssues.map(({ code }) => code)).toContain(
        'minor-description-not-allowed',
      );
    },
  );

  it.each(['age 18 explorer', '18yo explorer', 'aged 42 explorer', 'young adult explorer'])(
    'does not misclassify an adult description written as %s',
    (characterBase) => {
      const draft = {
        ...createPromptBuilderDraft('character-transform'),
        characterBase,
      };

      expect(
        validatePromptBuilderDraft(draft).blockingIssues.map(({ code }) => code),
      ).not.toContain('minor-description-not-allowed');
    },
  );

  it('supports only adult age choices when sanitizing untrusted builder state', () => {
    const sanitized = sanitizePromptBuilderDraft({
      intent: 'character-transform',
      adultAge: 'teen',
      characterBase: 'navigator',
      token: 'must-not-survive',
    });
    expect(sanitized?.intent).toBe('character-transform');
    if (sanitized?.intent === 'character-transform') expect(sanitized.adultAge).toBeNull();
    expect(JSON.stringify(sanitized)).not.toContain('token');
  });

  it('offers an optional allowlisted gender choice with an adult-safe generated description', () => {
    const draft = {
      ...createPromptBuilderDraft('character-transform'),
      gender: 'non-binary' as const,
      characterBase: 'gallery curator',
    };
    expect(generateStructuredPrompt(draft).prompt).toBe(
      'Substitute the character in the video with adult non-binary person gallery curator.',
    );

    const sanitized = sanitizePromptBuilderDraft({
      ...draft,
      gender: 'unsupported-value',
    });
    expect(sanitized?.intent).toBe('character-transform');
    if (sanitized?.intent === 'character-transform') expect(sanitized.gender).toBeNull();
  });

  it('returns advisory warnings for weak or conflicting directions', () => {
    const draft: PromptBuilderDraft = {
      ...createPromptBuilderDraft('character-transform'),
      intent: 'character-transform',
      characterBase: 'character',
      matchReference: true,
      expression: 'smiling and frowning',
      customDetails: 'change the background and add a lamp',
    };
    const warnings = validatePromptBuilderDraft(draft, {
      hasReferenceImage: true,
      image: { width: 300, height: 1_000 },
    }).warnings.map(({ code }) => code);
    expect(warnings).toEqual(
      expect.arrayContaining([
        'generic-description',
        'multiple-goals',
        'contradictory-traits',
        'background-edit',
        'low-reference-resolution',
        'weak-reference-aspect',
      ]),
    );
  });

  it('warns but does not block reference-dependent text without an image', () => {
    const draft = {
      ...createPromptBuilderDraft('character-transform'),
      intent: 'character-transform' as const,
      matchReference: true,
    };
    const validation = validatePromptBuilderDraft(draft, { hasReferenceImage: false });
    expect(validation.valid).toBe(true);
    expect(validation.warnings.map(({ code }) => code)).toContain('reference-image-missing');
  });
});

describe('character reference image prompt', () => {
  it('wraps the unchanged workshop prompt in the Lucy reference composition', () => {
    const workshopPrompt =
      '  Substitute the character in the video with an indigo-haired lunar\r\ncartographer.  ';
    const imagePrompt = buildCharacterReferenceImagePrompt(workshopPrompt);

    expect(imagePrompt).toContain('Exactly one character with one clearly visible face');
    expect(imagePrompt).toContain('Front-facing, centered, and viewed at eye level');
    expect(imagePrompt).toContain('Full-body framing by default');
    expect(imagePrompt).toContain('Show the complete character');
    expect(imagePrompt).toContain(workshopPrompt);
    expect(imagePrompt.endsWith(workshopPrompt)).toBe(true);
  });

  it('honors a deliberate closer crop instead of the full-body default', () => {
    const imagePrompt = buildCharacterReferenceImagePrompt(
      'A blue-furred fox wearing a red scarf.',
      'head_and_shoulders',
    );

    expect(imagePrompt).toContain('Use a deliberate head-and-shoulders crop');
  });

  it('provides a stable canonical value for server-side SHA-256 hashing', () => {
    expect(characterReferencePromptHashInput('  Lunar   Cartographer  ')).toBe(
      characterReferencePromptHashInput('lunar cartographer'),
    );
  });
});
