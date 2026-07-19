// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_IMAGE_BYTES, validateReferenceImage } from './imageValidation';

const sizedFile = (size: number, name: string, type: string): File =>
  new File([new Uint8Array(size)], name, { type });

const mockDimensions = (width: number, height: number) => {
  const close = vi.fn();
  vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width, height, close }));
  return close;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('reference image validation', () => {
  it.each([
    ['image/jpeg', 'portrait.jpg'],
    ['image/png', 'portrait.png'],
    ['image/webp', 'portrait.webp'],
  ])('accepts %s at exactly the inclusive 10 MiB limit', async (type, name) => {
    const close = mockDimensions(800, 1_000);

    const result = await validateReferenceImage(sizedFile(MAX_IMAGE_BYTES, name, type), 'lucy-2.5');

    expect(result.blockingError).toBeNull();
    expect(result).toMatchObject({ width: 800, height: 1_000 });
    expect(result.warnings).toContain(
      'Images below 5 MiB usually respond faster in a realtime session.',
    );
    expect(close).toHaveBeenCalledOnce();
  });

  it('rejects one byte over 10 MiB before attempting to decode', async () => {
    const decoder = vi.fn();
    vi.stubGlobal('createImageBitmap', decoder);

    const result = await validateReferenceImage(
      sizedFile(MAX_IMAGE_BYTES + 1, 'too-large.png', 'image/png'),
      'lucy-vton-3',
    );

    expect(result).toEqual({
      blockingError: 'Choose an image that is 10 MiB or smaller.',
      warnings: [],
    });
    expect(decoder).not.toHaveBeenCalled();
  });

  it('rejects unsupported and empty inputs before decode', async () => {
    const decoder = vi.fn();
    vi.stubGlobal('createImageBitmap', decoder);

    await expect(
      validateReferenceImage(sizedFile(10, 'portrait.gif', 'image/gif'), 'lucy-2.5'),
    ).resolves.toEqual({ blockingError: 'Choose a JPEG, PNG, or WebP image.', warnings: [] });
    await expect(
      validateReferenceImage(sizedFile(0, 'empty.webp', 'image/webp'), 'lucy-2.5'),
    ).resolves.toEqual({ blockingError: 'Choose a nonempty image.', warnings: [] });
    expect(decoder).not.toHaveBeenCalled();
  });

  it('returns mode-aware guidance without blocking a decodable image', async () => {
    mockDimensions(400, 900);
    const character = await validateReferenceImage(
      sizedFile(1_024, 'narrow.jpg', 'image/jpeg'),
      'lucy-2.5',
    );
    expect(character.blockingError).toBeNull();
    expect(character.warnings).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/shortest side of at least 512 px/i),
        expect.stringMatching(/portrait-oriented reference/i),
      ]),
    );

    mockDimensions(2_400, 800);
    const garment = await validateReferenceImage(
      sizedFile(1_024, 'wide.webp', 'image/webp'),
      'lucy-vton-3',
    );
    expect(garment.blockingError).toBeNull();
    expect(garment.warnings).toContain(
      'Use an image where the garment is clearly visible and fills the frame.',
    );
  });

  it('uses the domain aspect-ratio thresholds for each reference semantic', async () => {
    mockDimensions(1_100, 1_000);
    const character = await validateReferenceImage(
      sizedFile(1_024, 'slightly-wide.jpg', 'image/jpeg'),
      'lucy-2.5',
    );
    expect(character.warnings).toContain(
      'A clear portrait-oriented reference generally works best for character identity.',
    );

    mockDimensions(300, 1_000);
    const garment = await validateReferenceImage(
      sizedFile(1_024, 'very-narrow.webp', 'image/webp'),
      'lucy-vton-3',
    );
    expect(garment.warnings).toContain(
      'Use an image where the garment is clearly visible and fills the frame.',
    );
  });

  it('sanitizes decode failure into a stable user-facing error', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('decoder internals')));

    await expect(
      validateReferenceImage(sizedFile(24, 'broken.png', 'image/png'), 'lucy-2.5'),
    ).resolves.toEqual({
      blockingError: 'The browser could not decode this image.',
      warnings: [],
    });
  });
});
