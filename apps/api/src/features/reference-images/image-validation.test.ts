import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { REFERENCE_IMAGE_MAX_BYTES, REFERENCE_IMAGE_UPLOAD_MAX_BYTES } from '@studio/contracts';
import {
  InvalidReferenceImageError,
  InvalidReferenceImageUploadError,
  decodeStrictBase64,
  validateReferenceImage,
  validateUploadedReferenceImage,
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

describe('uploaded reference image validation', () => {
  it.each(['jpeg', 'png', 'webp'] as const)(
    'preserves fully decoded %s upload bytes and metadata',
    async (format) => {
      const bytes = Buffer.from(await imageBase64(800, 1200, format), 'base64');
      const result = await validateUploadedReferenceImage(bytes, `image/${format}`);

      expect(result).toEqual({
        bytes,
        width: 800,
        height: 1200,
        mimeType: `image/${format}`,
      });
    },
  );

  it('rejects declared and decoded MIME mismatches and corrupt bytes', async () => {
    const jpeg = Buffer.from(await imageBase64(800, 1200, 'jpeg'), 'base64');

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
