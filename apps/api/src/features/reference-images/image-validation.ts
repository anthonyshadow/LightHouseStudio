import { REFERENCE_IMAGE_MAX_BYTES } from '@studio/contracts';
import sharp from 'sharp';

const MAX_PROVIDER_IMAGE_BYTES = 32 * 1024 * 1024;
const EXPECTED_EDGE_LENGTH = 1024;

export type ValidReferenceImageMimeType = 'image/jpeg' | 'image/png' | 'image/webp';

export interface ValidatedReferenceImage {
  readonly bytes: Buffer;
  readonly mimeType: ValidReferenceImageMimeType;
  readonly width: 1024;
  readonly height: 1024;
}

export class InvalidReferenceImageError extends Error {
  constructor(message: string, options?: { readonly cause?: unknown }) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'InvalidReferenceImageError';
  }
}

const MAX_PROVIDER_BASE64_LENGTH = Math.ceil(MAX_PROVIDER_IMAGE_BYTES / 3) * 4;

const isBase64AlphabetCode = (code: number): boolean =>
  (code >= 0x41 && code <= 0x5a) ||
  (code >= 0x61 && code <= 0x7a) ||
  (code >= 0x30 && code <= 0x39) ||
  code === 0x2b ||
  code === 0x2f;

/** Linear strict validation avoids regex stack exhaustion on multi-megabyte provider output. */
const hasCanonicalBase64Shape = (encoded: string): boolean => {
  if (
    encoded.length === 0 ||
    encoded.length % 4 !== 0 ||
    encoded.length > MAX_PROVIDER_BASE64_LENGTH
  ) {
    return false;
  }

  const padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0;
  const contentLength = encoded.length - padding;
  for (let index = 0; index < contentLength; index += 1) {
    if (!isBase64AlphabetCode(encoded.charCodeAt(index))) return false;
  }
  return true;
};

export const decodeStrictBase64 = (encoded: string): Buffer => {
  if (!hasCanonicalBase64Shape(encoded)) {
    throw new InvalidReferenceImageError('The provider returned malformed base64 image data.');
  }

  const bytes = Buffer.from(encoded, 'base64');
  if (
    bytes.byteLength === 0 ||
    bytes.byteLength > MAX_PROVIDER_IMAGE_BYTES ||
    bytes.toString('base64') !== encoded
  ) {
    throw new InvalidReferenceImageError('The provider returned invalid base64 image data.');
  }
  return bytes;
};

const mimeTypeForFormat = (format: string | undefined): ValidReferenceImageMimeType => {
  switch (format) {
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    default:
      throw new InvalidReferenceImageError(
        'The provider image must be a decodable JPEG, PNG, or WebP.',
      );
  }
};

const inspectImage = async (
  bytes: Buffer,
): Promise<{ readonly mimeType: ValidReferenceImageMimeType }> => {
  try {
    const image = sharp(bytes, {
      failOn: 'error',
      limitInputPixels: EXPECTED_EDGE_LENGTH * EXPECTED_EDGE_LENGTH,
    });
    const metadata = await image.metadata();
    const mimeType = mimeTypeForFormat(metadata.format);
    if (metadata.width !== EXPECTED_EDGE_LENGTH || metadata.height !== EXPECTED_EDGE_LENGTH) {
      throw new InvalidReferenceImageError('The provider image must be exactly 1024 by 1024.');
    }
    // Metadata alone can succeed for truncated files. Fully decode before accepting the bytes.
    await image.clone().raw().toBuffer();
    return { mimeType };
  } catch (error) {
    if (error instanceof InvalidReferenceImageError) throw error;
    throw new InvalidReferenceImageError('The provider returned an undecodable image.', {
      cause: error,
    });
  }
};

export const validateReferenceImage = async (encoded: string): Promise<ValidatedReferenceImage> => {
  let bytes = decodeStrictBase64(encoded);
  let inspected = await inspectImage(bytes);

  if (bytes.byteLength >= REFERENCE_IMAGE_MAX_BYTES) {
    try {
      bytes = await sharp(bytes, { failOn: 'error' })
        .flatten({ background: '#ffffff' })
        .jpeg({ quality: 90 })
        .toBuffer();
      inspected = await inspectImage(bytes);
    } catch (error) {
      if (error instanceof InvalidReferenceImageError) throw error;
      throw new InvalidReferenceImageError(
        'The oversized provider image could not be normalized.',
        {
          cause: error,
        },
      );
    }
  }

  if (bytes.byteLength >= REFERENCE_IMAGE_MAX_BYTES) {
    throw new InvalidReferenceImageError('The provider image exceeds the 5 MiB asset limit.');
  }

  return {
    bytes,
    mimeType: inspected.mimeType,
    width: EXPECTED_EDGE_LENGTH,
    height: EXPECTED_EDGE_LENGTH,
  };
};
