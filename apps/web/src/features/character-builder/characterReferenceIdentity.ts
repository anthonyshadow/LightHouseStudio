import type { CharacterReferenceOptions } from '@studio/contracts';

const normalizedRawPrompt = (value: string) => value.replace(/\s+/gu, ' ').trim();

export const createReferencePromptOptimizationKey = (
  rawPrompt: string,
  options: CharacterReferenceOptions,
): string =>
  JSON.stringify({
    rawPrompt: normalizedRawPrompt(rawPrompt),
    options,
  });

export const createReferencePreviewSourceKey = (
  rawPrompt: string,
  options: CharacterReferenceOptions,
  sourceAssetId?: string | null,
): string =>
  JSON.stringify({
    rawPrompt: normalizedRawPrompt(rawPrompt),
    options,
    sourceAssetId: sourceAssetId ?? null,
  });
