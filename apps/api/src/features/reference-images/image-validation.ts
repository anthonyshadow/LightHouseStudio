import { REFERENCE_IMAGE_MAX_BYTES, type ReferenceImageSize } from '@studio/contracts';
import sharp from 'sharp';

const MAX_PROVIDER_IMAGE_BYTES = 32 * 1024 * 1024;
const MAX_EDGE_LENGTH = 1536;

const dimensionsForSize = (
  size: ReferenceImageSize,
): { readonly width: 1024 | 1536; readonly height: 1024 | 1536 } => {
  switch (size) {
    case '1024x1024':
      return { width: 1024, height: 1024 };
    case '1024x1536':
      return { width: 1024, height: 1536 };
    case '1536x1024':
      return { width: 1536, height: 1024 };
  }
};

export type ValidReferenceImageMimeType = 'image/jpeg' | 'image/png' | 'image/webp';

export interface ValidatedReferenceImage {
  readonly bytes: Buffer;
  readonly mimeType: ValidReferenceImageMimeType;
  readonly width: 1024 | 1536;
  readonly height: 1024 | 1536;
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
  expectedSize: ReferenceImageSize,
): Promise<{ readonly mimeType: ValidReferenceImageMimeType }> => {
  const expected = dimensionsForSize(expectedSize);
  try {
    const image = sharp(bytes, {
      failOn: 'error',
      limitInputPixels: MAX_EDGE_LENGTH * MAX_EDGE_LENGTH,
    });
    const metadata = await image.metadata();
    const mimeType = mimeTypeForFormat(metadata.format);
    if (metadata.width !== expected.width || metadata.height !== expected.height) {
      throw new InvalidReferenceImageError(
        `The provider image must be exactly ${expected.width} by ${expected.height}.`,
      );
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

export const validateReferenceImage = async (
  encoded: string,
  expectedSize: ReferenceImageSize = '1024x1024',
): Promise<ValidatedReferenceImage> => {
  let bytes = decodeStrictBase64(encoded);
  let inspected = await inspectImage(bytes, expectedSize);

  if (bytes.byteLength >= REFERENCE_IMAGE_MAX_BYTES) {
    try {
      bytes = await sharp(bytes, { failOn: 'error' })
        .flatten({ background: '#ffffff' })
        .jpeg({ quality: 90 })
        .toBuffer();
      inspected = await inspectImage(bytes, expectedSize);
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

  const dimensions = dimensionsForSize(expectedSize);
  return {
    bytes,
    mimeType: inspected.mimeType,
    width: dimensions.width,
    height: dimensions.height,
  };
};
