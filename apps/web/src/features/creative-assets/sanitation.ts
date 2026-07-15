import {
  ASSET_NAME_MAX_LENGTH,
  CHARACTER_NOTES_MAX_LENGTH,
  RECENT_PROMPT_LIMIT,
  SAVED_CHARACTER_PROMPT_LIMIT,
  SAVED_PROMPT_LIMIT,
  TAG_LIMIT,
  createEmptyCreativeAssetStore,
  normalizeAuthoredPrompt,
  normalizeTags as normalizeDomainTags,
  normalizeWhitespace,
  sanitizeCreativeAssetStore,
} from '@studio/domain';

export {
  RECENT_PROMPT_LIMIT,
  SAVED_CHARACTER_PROMPT_LIMIT,
  SAVED_PROMPT_LIMIT,
  TAG_LIMIT,
  createEmptyCreativeAssetStore,
  sanitizeCreativeAssetStore,
};

export const normalizeAssetText = (value: unknown, limit: number) =>
  typeof value === 'string' ? normalizeWhitespace(value, limit) : '';

export const normalizePromptText = (value: unknown) =>
  typeof value === 'string' ? normalizeAuthoredPrompt(value) : '';

export const normalizeAssetName = (value: unknown) =>
  normalizeAssetText(value, ASSET_NAME_MAX_LENGTH);

export const normalizeAssetNotes = (value: unknown) =>
  normalizeAssetText(value, CHARACTER_NOTES_MAX_LENGTH);

export const normalizeTags = (value: unknown): string[] =>
  normalizeDomainTags(
    Array.isArray(value) ? value.filter((tag): tag is string => typeof tag === 'string') : [],
  );
