import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { normalizeWiroImage } from './normalize-image.js';

const sourceImage = (width: number, height: number): Promise<Buffer> =>
  sharp({ create: { width, height, channels: 3, background: '#49637a' } })
    .png()
    .toBuffer();

describe('normalizeWiroImage', () => {
  it.each([
    ['1024x1024', 320, 320, 1024, 1024, 'jpeg'],
    ['1024x1536', 320, 480, 1024, 1536, 'png'],
    ['1536x1024', 480, 320, 1536, 1024, 'webp'],
  ] as const)(
    'normalizes %s provider output to exact local dimensions and requested %s encoding',
    async (size, sourceWidth, sourceHeight, width, height, format) => {
      const normalized = await normalizeWiroImage(
        await sourceImage(sourceWidth, sourceHeight),
        size,
        format,
      );

      expect(normalized.mimeType).toBe(`image/${format}`);
      await expect(sharp(normalized.bytes).metadata()).resolves.toMatchObject({
        width,
        height,
        format,
      });
    },
  );

  it('rejects corrupt bytes and output with the wrong aspect ratio', async () => {
    await expect(
      normalizeWiroImage(Buffer.from('not an image'), '1024x1024', 'jpeg'),
    ).rejects.toMatchObject({ providerId: 'wiro', reason: 'invalid-response' });
    await expect(
      normalizeWiroImage(await sourceImage(400, 300), '1024x1024', 'jpeg'),
    ).rejects.toMatchObject({ providerId: 'wiro', reason: 'invalid-response' });
  });
});
