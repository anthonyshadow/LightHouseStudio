import { createCreativeAssetRepository } from '@web/features/creative-assets/repository';
import type { CreativeAssetRepository } from '@web/features/creative-assets/types';
import { createPromptBuilderDraft } from '@web/features/prompt-authoring';
import type { CharacterTransformDraft } from '@studio/domain';

export const createSeededCreativeAssetRepository = (): CreativeAssetRepository => {
  let id = 0;
  const repository = createCreativeAssetRepository({
    storage: null,
    idFactory: () => `storybook-asset-${++id}`,
    now: () => new Date('2026-07-25T14:00:00.000Z'),
  });

  repository.createSavedPrompt({
    title: 'Midnight culture host',
    prompt:
      'Transform the adult subject into a polished midnight culture host in a structured navy jacket.',
    modelModeId: 'lucy-2.5',
    source: 'manual',
    tags: ['editorial', 'host', 'night'],
  });
  repository.createSavedPrompt({
    title: 'Copper runway jacket',
    prompt: 'Replace the garment with a sculpted copper satin runway jacket.',
    modelModeId: 'lucy-vton-3',
    source: 'generated',
    tags: ['fashion', 'copper'],
  });
  repository.recordSuccessfulPrompt({
    prompt: 'Transform the adult subject into a sunlit botanical field explorer.',
    modelModeId: 'lucy-2.5',
  });
  repository.createSavedCharacterPrompt({
    name: 'Botanical explorer',
    prompt: 'Transform the adult subject into a tactile, sunlit botanical explorer.',
    promptIntent: 'character-transform',
    builderDraft: {
      ...(createPromptBuilderDraft('character-transform') as CharacterTransformDraft),
      characterBase: 'botanical explorer',
      adultAge: 'adult',
      outfit: 'textured utility overshirt in moss and sand tones',
      mood: 'curious, grounded, and adventurous',
    },
    referenceImageStatus: 'portrait-required-not-saved',
    notes: 'A grounded field-documentary direction.',
    tags: ['outdoors', 'documentary'],
  });

  return repository;
};
