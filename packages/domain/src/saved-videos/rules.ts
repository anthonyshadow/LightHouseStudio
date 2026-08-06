const removeControlCharacters = (value: string): string =>
  [...value]
    .filter((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint > 31 && codePoint !== 127;
    })
    .join('');

export const normalizeSavedVideoTitle = (value: string): string => {
  const normalized = removeControlCharacters(value).replaceAll(/\s+/gu, ' ').trim();
  return normalized.slice(0, 120) || 'Untitled video';
};

export const savedVideoVersionCanAppend = (
  currentVersionId: string,
  expectedCurrentVersionId: string,
): boolean => currentVersionId === expectedCurrentVersionId;
