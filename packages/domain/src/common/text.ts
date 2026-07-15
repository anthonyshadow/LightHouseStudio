export const PROMPT_MAX_LENGTH = 4_000;
export const ASSET_NAME_MAX_LENGTH = 80;
export const CHARACTER_NOTES_MAX_LENGTH = 220;
export const TAG_MAX_LENGTH = 40;
export const TAG_LIMIT = 12;
export const BUILDER_DETAIL_MAX_LENGTH = 500;

const whitespacePattern = /\s+/gu;

export const trimText = (value: string, maxLength = Number.POSITIVE_INFINITY): string =>
  value.trim().slice(0, maxLength);

export const normalizeWhitespace = (value: string, maxLength = Number.POSITIVE_INFINITY): string =>
  value.replace(whitespacePattern, ' ').trim().slice(0, maxLength);

/** Trims only the boundary of authored prompts so intentional internal formatting survives. */
export const normalizeAuthoredPrompt = (value: string): string =>
  trimText(value.replace(/\r\n?/gu, '\n'), PROMPT_MAX_LENGTH);

/** Used for case-insensitive prompt identity and recent-prompt deduplication. */
export const canonicalPrompt = (value: string): string =>
  normalizeWhitespace(value, PROMPT_MAX_LENGTH).toLocaleLowerCase('en-US');

export const normalizeTags = (values: readonly string[]): string[] => {
  const tags: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const tag = normalizeWhitespace(value, TAG_MAX_LENGTH);
    const key = tag.toLocaleLowerCase('en-US');
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
    if (tags.length === TAG_LIMIT) break;
  }

  return tags;
};

export const containsMeaningfulText = (value: string): boolean => /[\p{L}\p{N}]/u.test(value);
