import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { REFERENCE_IMAGE_MAX_BYTES, REFERENCE_IMAGE_UPLOAD_MAX_BYTES } from '@studio/contracts';
import {
  InvalidReferenceImageError,
  InvalidReferenceImageUploadError,
  validateReferenceImageBytes,
  validateUploadedReferenceImage,
} from './image-validation.js';

const imageBytes = async (
  width = 1024,
  height = 1024,
  format: 'jpeg' | 'png' | 'webp' = 'jpeg',
): Promise<Buffer> => {
  const pipeline = sharp({
    create: { width, height, channels: 3, background: '#345678' },
  });
  return format === 'jpeg'
    ? pipeline.jpeg({ quality: 90 }).toBuffer()
    : format === 'png'
      ? pipeline.png().toBuffer()
      : pipeline.webp().toBuffer();
};

describe('reference image validation', () => {
  it('fully decodes every supported 1024-square format', async () => {
    for (const format of ['jpeg', 'png', 'webp'] as const) {
      const result = await validateReferenceImageBytes(await imageBytes(1024, 1024, format));

      expect(result, format).toMatchObject({
        width: 1024,
        height: 1024,
        mimeType: `image/${format}`,
      });
      expect(result.bytes.byteLength, format).toBeLessThan(5 * 1024 * 1024);
    }
  });

  it('validates each requested portrait and landscape orientation exactly', async () => {
    for (const [size, width, height] of [
      ['1024x1536', 1024, 1536],
      ['1536x1024', 1536, 1024],
    ] as const) {
      const result = await validateReferenceImageBytes(await imageBytes(width, height), size);
      expect(result, size).toMatchObject({ width, height, mimeType: 'image/jpeg' });
      await expect(
        validateReferenceImageBytes(await imageBytes(height, width), size),
        size,
      ).rejects.toThrow(`exactly ${width} by ${height}`);
    }
  });

  it('rejects an image that is not exactly 1024 by 1024', async () => {
    await expect(validateReferenceImageBytes(await imageBytes(512, 512))).rejects.toThrow(
      'exactly 1024 by 1024',
    );
  });

  it('rejects bytes that are not a decodable supported image', async () => {
    await expect(validateReferenceImageBytes(Buffer.from('not an image'))).rejects.toBeInstanceOf(
      InvalidReferenceImageError,
    );
  });

  it('normalizes an oversized valid image once as JPEG quality 90', async () => {
    const source = await sharp({
      create: { width: 1024, height: 1024, channels: 4, background: '#345678' },
    })
      .png()
      .toBuffer();
    // A decoder-safe trailing payload exercises the provider-size branch without requiring
    // an enormous high-entropy fixture in the repository.
    const oversized = Buffer.concat([source, Buffer.alloc(REFERENCE_IMAGE_MAX_BYTES, 0x41)]);

    expect(oversized.byteLength).toBeGreaterThanOrEqual(REFERENCE_IMAGE_MAX_BYTES);
    const result = await validateReferenceImageBytes(oversized);

    expect(result.mimeType).toBe('image/jpeg');
    expect(result.bytes.byteLength).toBeLessThan(REFERENCE_IMAGE_MAX_BYTES);
    await expect(sharp(result.bytes).metadata()).resolves.toMatchObject({
      format: 'jpeg',
      width: 1024,
      height: 1024,
    });
  });
});

describe('uploaded reference image validation', () => {
  it('preserves decoded upload bytes and metadata for every supported format', async () => {
    for (const format of ['jpeg', 'png', 'webp'] as const) {
      const bytes = await imageBytes(800, 1200, format);
      const result = await validateUploadedReferenceImage(bytes, `image/${format}`);

      expect(result).toEqual({
        bytes,
        width: 800,
        height: 1200,
        mimeType: `image/${format}`,
      });
    }
  });

  it('rejects declared and decoded MIME mismatches and corrupt bytes', async () => {
    const jpeg = await imageBytes(800, 1200, 'jpeg');

    await expect(validateUploadedReferenceImage(jpeg, 'image/png')).rejects.toThrow(
      /do(?:es)? not match/u,
    );
    await expect(
      validateUploadedReferenceImage(Buffer.from('not an image'), 'image/png'),
    ).rejects.toBeInstanceOf(InvalidReferenceImageUploadError);
  });

  it('rejects uploads above the byte and decoded-pixel safety limits', async () => {
    await expect(
      validateUploadedReferenceImage(
        Buffer.alloc(REFERENCE_IMAGE_UPLOAD_MAX_BYTES + 1),
        'image/png',
      ),
    ).rejects.toThrow('10 MiB');

    const tooManyPixels = await sharp({
      create: { width: 8_000, height: 5_001, channels: 3, background: '#345678' },
    })
      .png({ compressionLevel: 9 })
      .toBuffer();
    await expect(validateUploadedReferenceImage(tooManyPixels, 'image/png')).rejects.toThrow(
      '40-megapixel',
    );
  });
});
