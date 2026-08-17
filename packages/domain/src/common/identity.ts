/**
 * Identifier and timestamp guards shared by the aggregate rule modules.
 *
 * Each aggregate throws its own error type, so these take the thrower rather than owning it — the
 * *policy* is shared, the error taxonomy stays with the aggregate. Keeping one copy matters most
 * for `requireOpaqueId`: rejecting `blob:` / `data:` / `http:` values is a security guard, and a
 * tightening applied to one aggregate must not silently miss the others.
 */

const OPAQUE_ID_MAX_LENGTH = 200;
const LOCATOR_SCHEME_PATTERN = /^(?:blob|data|https?):/iu;

export const requireOpaqueId = (
  value: string,
  label: string,
  onInvalid: (message: string) => never,
): string => {
  const normalized = value.trim();
  if (
    normalized.length === 0 ||
    normalized.length > OPAQUE_ID_MAX_LENGTH ||
    LOCATOR_SCHEME_PATTERN.test(normalized)
  ) {
    onInvalid(`${label} must be an opaque durable identifier.`);
  }
  return normalized;
};

export const requireIsoTimestamp = (
  value: string,
  onInvalid: (message: string) => never,
): string => {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.valueOf())) onInvalid('A valid timestamp is required.');
  return parsed.toISOString();
};

/**
 * Strips C0 control characters. `preserveNewlines` keeps newline and tab for multi-line authored
 * text; `stripDelete` additionally removes DEL (127). Both are opt-in because the aggregates
 * genuinely differ here — single-line titles strip DEL, multi-line briefs do not.
 */
export const stripControlCharacters = (
  value: string,
  options: { readonly preserveNewlines?: boolean; readonly stripDelete?: boolean } = {},
): string =>
  [...value]
    .filter((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      if (options.stripDelete === true && codePoint === 127) return false;
      if (codePoint > 31) return true;
      return options.preserveNewlines === true && (character === '\n' || character === '\t');
    })
    .join('');
