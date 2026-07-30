type CanonicalBase64DecodeResult =
  | { readonly ok: true; readonly bytes: Buffer }
  | { readonly ok: false; readonly reason: 'shape' | 'content' };

const isBase64AlphabetCode = (code: number): boolean =>
  (code >= 0x41 && code <= 0x5a) ||
  (code >= 0x61 && code <= 0x7a) ||
  (code >= 0x30 && code <= 0x39) ||
  code === 0x2b ||
  code === 0x2f;

/**
 * Strictly decodes canonical base64 without accepting whitespace or URL-safe variants.
 * Linear shape validation avoids regex stack exhaustion on multi-megabyte provider output.
 */
export const decodeCanonicalBase64 = (
  encoded: string,
  maxBytes: number,
): CanonicalBase64DecodeResult => {
  const maxEncodedLength = Math.ceil(maxBytes / 3) * 4;
  if (encoded.length === 0 || encoded.length % 4 !== 0 || encoded.length > maxEncodedLength) {
    return { ok: false, reason: 'shape' };
  }

  const padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0;
  const contentLength = encoded.length - padding;
  for (let index = 0; index < contentLength; index += 1) {
    if (!isBase64AlphabetCode(encoded.charCodeAt(index))) {
      return { ok: false, reason: 'shape' };
    }
  }

  const bytes = Buffer.from(encoded, 'base64');
  if (
    bytes.byteLength === 0 ||
    bytes.byteLength > maxBytes ||
    bytes.toString('base64') !== encoded
  ) {
    return { ok: false, reason: 'content' };
  }
  return { ok: true, bytes };
};
