import { describe, expect, it } from 'vitest';
import {
  CHARACTER_REFERENCE_FRAMINGS,
  REFERENCE_IMAGE_MAX_BYTES,
  REFERENCE_IMAGE_PROMPT_MAX_LENGTH,
  REFERENCE_IMAGE_UPLOAD_MAX_BYTES,
  SUPPORTED_MODEL_IDS,
  referenceImageMimeTypeSchema,
} from '@studio/contracts';
import {
  CHARACTER_REFERENCE_PROMPT_FRAMINGS,
  IMAGE_MIME_TYPES,
  MAX_IMAGE_BYTES,
  MODEL_MODE_IDS,
  PROMPT_MAX_LENGTH,
  RECOMMENDED_IMAGE_BYTES,
} from '@studio/domain';

describe('independent domain and wire value sets', () => {
  it('keeps realtime model identifiers in parity', () => {
    expect(MODEL_MODE_IDS).toEqual(SUPPORTED_MODEL_IDS);
  });

  it('keeps reference framing identifiers in parity', () => {
    expect(CHARACTER_REFERENCE_PROMPT_FRAMINGS).toEqual(CHARACTER_REFERENCE_FRAMINGS);
  });

  it('keeps reference image MIME types and byte limits in parity', () => {
    expect(IMAGE_MIME_TYPES).toEqual(referenceImageMimeTypeSchema.options);
    expect(MAX_IMAGE_BYTES).toBe(REFERENCE_IMAGE_UPLOAD_MAX_BYTES);
    expect(RECOMMENDED_IMAGE_BYTES).toBe(REFERENCE_IMAGE_MAX_BYTES);
  });

  it('keeps authored prompt length in parity', () => {
    expect(PROMPT_MAX_LENGTH).toBe(REFERENCE_IMAGE_PROMPT_MAX_LENGTH);
  });
});
