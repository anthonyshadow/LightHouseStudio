import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { REFERENCE_IMAGE_MAX_BYTES } from '@studio/contracts';
import {
  InvalidReferenceImageError,
  decodeStrictBase64,
  validateReferenceImage,
} from './image-validation.js';

const imageBase64 = async (
  width = 1024,
  height = 1024,
  format: 'jpeg' | 'png' | 'webp' = 'jpeg',
): Promise<string> => {
  const pipeline = sharp({
    create: { width, height, channels: 3, background: '#345678' },
  });
  const bytes =
    format === 'jpeg'
      ? await pipeline.jpeg({ quality: 90 }).toBuffer()
      : format === 'png'
        ? await pipeline.png().toBuffer()
        : await pipeline.webp().toBuffer();
  return bytes.toString('base64');
};

describe('reference image validation', () => {
  it.each(['aW1hZ2U', 'aW1h Z2U=', 'aW1hZ2U_', '===='])(
    'rejects noncanonical base64 %s',
    (encoded) => {
      expect(() => decodeStrictBase64(encoded)).toThrow(InvalidReferenceImageError);
    },
  );

  it.each(['jpeg', 'png', 'webp'] as const)('fully decodes a 1024-square %s', async (format) => {
    const result = await validateReferenceImage(await imageBase64(1024, 1024, format));

    expect(result).toMatchObject({
      width: 1024,
      height: 1024,
      mimeType: `image/${format}`,
    });
    expect(result.bytes.byteLength).toBeLessThan(5 * 1024 * 1024);
  });

  it.each([
    ['1024x1536', 1024, 1536],
    ['1536x1024', 1536, 1024],
  ] as const)('validates the requested %s orientation exactly', async (size, width, height) => {
    const result = await validateReferenceImage(await imageBase64(width, height), size);
    expect(result).toMatchObject({ width, height, mimeType: 'image/jpeg' });
    await expect(validateReferenceImage(await imageBase64(height, width), size)).rejects.toThrow(
      `exactly ${width} by ${height}`,
    );
  });

  it('rejects an image that is not exactly 1024 by 1024', async () => {
    await expect(validateReferenceImage(await imageBase64(512, 512))).rejects.toThrow(
      'exactly 1024 by 1024',
    );
  });

  it('rejects canonical base64 that is not a decodable supported image', async () => {
    await expect(
      validateReferenceImage(Buffer.from('not an image').toString('base64')),
    ).rejects.toBeInstanceOf(InvalidReferenceImageError);
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
    const result = await validateReferenceImage(oversized.toString('base64'));

    expect(result.mimeType).toBe('image/jpeg');
    expect(result.bytes.byteLength).toBeLessThan(REFERENCE_IMAGE_MAX_BYTES);
    await expect(sharp(result.bytes).metadata()).resolves.toMatchObject({
      format: 'jpeg',
      width: 1024,
      height: 1024,
    });
  });
});
