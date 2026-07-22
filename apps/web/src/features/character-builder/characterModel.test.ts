import { createPromptBuilderDraft } from '@studio/domain';
import { describe, expect, it } from 'vitest';
import { buildCanonicalCharacterDraft, createGuidedDesignFromDraft } from './characterModel';

describe('guided character model hydration', () => {
  it('hydrates unrecognized canonical values as exact custom choices', () => {
    const draft = {
      ...createPromptBuilderDraft('character-transform'),
      presetId: 'documentary-presenter',
      gender: 'woman' as const,
      adultAge: 'middle-aged-adult' as const,
      characterBase: 'Documentary Presenter, investigative host',
      appearance: 'freckled with a completely custom grooming direction',
      skinTone: 'warm umber with golden undertones',
      bodyShape: 'strong pear-shaped silhouette',
      hair: 'waist-length spiral curls with a side sweep',
      hairColor: 'electric cobalt blue',
      outfit: 'hand-painted linen jumpsuit',
      accessories: 'a tiny brass telescope pin',
      expression: 'delighted and curious',
      mood: 'quiet confidence; hand-inked visual style; observatory background',
      preserve: 'the exact eye shape',
      customDetails: 'no logos',
    };

    const design = createGuidedDesignFromDraft(draft);

    expect(design).toMatchObject({
      starterId: 'documentary-presenter',
      choices: {
        gender: { optionId: 'shared.gender.woman' },
        adultAge: { optionId: 'shared.adultAge.middle-aged-adult' },
        appearance: { optionId: 'custom', customValue: draft.appearance },
        skinTone: { optionId: 'custom', customValue: draft.skinTone },
        bodyShape: { optionId: 'custom', customValue: draft.bodyShape },
        hair: { optionId: 'custom', customValue: draft.hair },
        hairColor: { optionId: 'custom', customValue: draft.hairColor },
        outfit: { optionId: 'custom', customValue: draft.outfit },
        accessories: { optionId: 'custom', customValue: draft.accessories },
        expression: { optionId: 'custom', customValue: draft.expression },
        role: { optionId: 'custom', customValue: 'investigative host' },
        style: { optionId: 'custom', customValue: 'hand-inked' },
        mood: { optionId: 'custom', customValue: 'quiet confidence' },
        background: { optionId: 'custom', customValue: 'observatory' },
      },
    });

    const roundTripped = buildCanonicalCharacterDraft(design, draft);
    expect(roundTripped).toMatchObject({
      skinTone: draft.skinTone,
      bodyShape: draft.bodyShape,
      hair: draft.hair,
      hairColor: draft.hairColor,
      outfit: draft.outfit,
      preserve: draft.preserve,
      customDetails: draft.customDetails,
    });
  });

  it('hydrates known values to stable catalog IDs', () => {
    const draft = {
      ...createPromptBuilderDraft('character-transform'),
      gender: 'man' as const,
      adultAge: 'adult' as const,
      bodyShape: 'adult man with a balanced body shape',
      hairColor: 'dark brown hair',
    };

    expect(createGuidedDesignFromDraft(draft).choices).toMatchObject({
      bodyShape: { optionId: 'man.bodyShape.balanced' },
      hairColor: { optionId: 'shared.hairColor.dark-brown' },
    });
  });
});
