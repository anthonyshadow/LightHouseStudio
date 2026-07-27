import {
  REFERENCE_IMAGE_MAX_BYTES,
  REFERENCE_IMAGE_UPLOAD_MAX_BYTES,
  REFERENCE_IMAGE_UPLOAD_MAX_PIXELS,
  type ReferenceImageSize,
} from '@studio/contracts';
import sharp from 'sharp';
import { MAX_PROVIDER_IMAGE_BYTES } from '../../providers/reference-images/reference-image-provider.js';

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

export interface ValidatedUploadedReferenceImage {
  readonly bytes: Buffer;
  readonly mimeType: ValidReferenceImageMimeType;
  readonly width: number;
  readonly height: number;
}

export class InvalidReferenceImageError extends Error {
  constructor(message: string, options?: { readonly cause?: unknown }) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'InvalidReferenceImageError';
  }
}

export class InvalidReferenceImageUploadError extends Error {
  constructor(message: string, options?: { readonly cause?: unknown }) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'InvalidReferenceImageUploadError';
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

export const validateReferenceImageBytes = async (
  providerBytes: Uint8Array,
  expectedSize: ReferenceImageSize = '1024x1024',
  declaredMimeType?: ValidReferenceImageMimeType,
): Promise<ValidatedReferenceImage> => {
  let bytes = Buffer.from(providerBytes);
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_PROVIDER_IMAGE_BYTES) {
    throw new InvalidReferenceImageError('The provider image exceeds the raw response limit.');
  }
  let inspected = await inspectImage(bytes, expectedSize);
  if (declaredMimeType !== undefined && inspected.mimeType !== declaredMimeType) {
    throw new InvalidReferenceImageError(
      'The provider image contents do not match the declared media type.',
    );
  }

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

export const validateReferenceImage = async (
  encoded: string,
  expectedSize: ReferenceImageSize = '1024x1024',
): Promise<ValidatedReferenceImage> =>
  validateReferenceImageBytes(decodeStrictBase64(encoded), expectedSize);

export const validateUploadedReferenceImage = async (
  bytes: Buffer,
  declaredMimeType: ValidReferenceImageMimeType,
): Promise<ValidatedUploadedReferenceImage> => {
  if (bytes.byteLength === 0) {
    throw new InvalidReferenceImageUploadError('Choose a non-empty image file.');
  }
  if (bytes.byteLength > REFERENCE_IMAGE_UPLOAD_MAX_BYTES) {
    throw new InvalidReferenceImageUploadError('The image exceeds the 10 MiB upload limit.');
  }

  try {
    const metadataImage = sharp(bytes, {
      failOn: 'error',
      // Header inspection is bounded by the upload byte limit. Check the declared
      // decoded dimensions before allowing Sharp to allocate the pixel payload.
      limitInputPixels: false,
    });
    const metadata = await metadataImage.metadata();
    const mimeType = mimeTypeForFormat(metadata.format);
    const width = metadata.width;
    const height = metadata.height;
    if (!width || !height || width * height > REFERENCE_IMAGE_UPLOAD_MAX_PIXELS) {
      throw new InvalidReferenceImageUploadError(
        'The image exceeds the 40-megapixel decoded-image limit.',
      );
    }
    if (mimeType !== declaredMimeType) {
      throw new InvalidReferenceImageUploadError(
        'The image contents do not match the declared JPEG, PNG, or WebP media type.',
      );
    }
    // Sharp stats walks the full pixel payload and rejects truncated/corrupt files.
    await sharp(bytes, {
      failOn: 'error',
      limitInputPixels: REFERENCE_IMAGE_UPLOAD_MAX_PIXELS,
    }).stats();
    return { bytes, mimeType, width, height };
  } catch (error) {
    if (error instanceof InvalidReferenceImageUploadError) throw error;
    if (error instanceof InvalidReferenceImageError) {
      throw new InvalidReferenceImageUploadError(
        'The file is not a decodable JPEG, PNG, or WebP image.',
        { cause: error },
      );
    }
    throw new InvalidReferenceImageUploadError(
      'The file is not a decodable JPEG, PNG, or WebP image within the pixel limit.',
      { cause: error },
    );
  }
};
