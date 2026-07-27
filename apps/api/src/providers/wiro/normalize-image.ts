import sharp, { type Sharp } from 'sharp';
import {
  dimensionsForReferenceImageSize,
  MAX_PROVIDER_IMAGE_BYTES,
  mimeTypeForReferenceImageFormat,
  ReferenceImageProviderError,
  type GenerateReferenceImageProviderInput,
  type ReferenceImageMimeType,
} from '../reference-images/reference-image-provider.js';

const MAX_WIRO_DECODED_PIXELS = 16_000_000;

const providerError = (cause?: unknown): ReferenceImageProviderError =>
  new ReferenceImageProviderError('invalid-response', {
    providerId: 'wiro',
    ...(cause === undefined ? {} : { cause }),
  });

const encode = (pipeline: Sharp, format: GenerateReferenceImageProviderInput['format']): Sharp => {
  switch (format) {
    case 'jpeg':
      return pipeline.flatten({ background: '#ffffff' }).jpeg({ quality: 90 });
    case 'png':
      return pipeline.png();
    case 'webp':
      return pipeline.webp({ quality: 90 });
  }
};

export interface NormalizedWiroImage {
  readonly bytes: Buffer;
  readonly mimeType: ReferenceImageMimeType;
}

export const normalizeWiroImage = async (
  sourceBytes: Uint8Array,
  size: GenerateReferenceImageProviderInput['size'],
  format: GenerateReferenceImageProviderInput['format'],
): Promise<NormalizedWiroImage> => {
  const bytes = Buffer.from(sourceBytes);
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_PROVIDER_IMAGE_BYTES) {
    throw providerError();
  }

  try {
    const metadata = await sharp(bytes, {
      failOn: 'error',
      limitInputPixels: MAX_WIRO_DECODED_PIXELS,
    }).metadata();
    if (metadata.width === undefined || metadata.height === undefined) throw providerError();

    const dimensions = dimensionsForReferenceImageSize(size);
    if (metadata.width * dimensions.height !== metadata.height * dimensions.width) {
      throw providerError();
    }

    const normalized = await encode(
      sharp(bytes, {
        failOn: 'error',
        limitInputPixels: MAX_WIRO_DECODED_PIXELS,
      })
        .rotate()
        .resize(dimensions.width, dimensions.height, { fit: 'fill' }),
      format,
    ).toBuffer();
    if (normalized.byteLength === 0 || normalized.byteLength > MAX_PROVIDER_IMAGE_BYTES) {
      throw providerError();
    }
    return {
      bytes: normalized,
      mimeType: mimeTypeForReferenceImageFormat(format),
    };
  } catch (error) {
    if (error instanceof ReferenceImageProviderError) throw error;
    throw providerError(error);
  }
};
