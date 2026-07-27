import { describe, expect, it } from 'vitest';
import type { ReferenceImageProviderDescriptor } from '../../providers/reference-images/reference-image-provider.js';
import type { StoredReferenceImageMetadata } from './asset-store.js';
import {
  assertMatchingRequestFingerprint,
  generationRequestFingerprint,
  type GenerateReferenceImageInput,
} from './reference-image-preparation.js';

const input: GenerateReferenceImageInput = {
  localOwnerId: 'a'.repeat(64),
  requestId: '37d15fec-43a3-47b2-8330-7fb410698564',
  rawPrompt: 'A silver-haired cartographer.',
  options: {
    framing: 'head_and_shoulders',
    orientation: 'square',
    renderingMode: 'photorealistic',
    expression: 'neutral',
    background: 'neutral_gray',
    targetUse: 'lucy_2_5_character_reference',
  },
  optimization: { enabled: false },
};

const openAiDescriptor: ReferenceImageProviderDescriptor = {
  providerId: 'openai',
  modelId: 'gpt-image-2',
  adapterVersion: 'openai-gpt-image-v1',
  effectiveSettings: { quality: 'high' },
};

const bflDescriptor: ReferenceImageProviderDescriptor = {
  providerId: 'bfl',
  modelId: 'flux-2-pro',
  adapterVersion: 'bfl-flux-2-pro-v1',
  effectiveSettings: { safetyTolerance: 4, disablePromptUpsampling: true },
};

const wiroDescriptor: ReferenceImageProviderDescriptor = {
  providerId: 'wiro',
  modelId: 'seedream-v5-lite-uncensored',
  adapterVersion: 'wiro-seedream-v5-lite-v1',
  effectiveSettings: {
    owner: 'ByteDance',
    resolution: '2k',
    maxImages: 1,
    watermark: false,
  },
};

describe('reference image request fingerprints', () => {
  it('binds idempotency to the authoritative provider, model, adapter, and settings', () => {
    const openAi = generationRequestFingerprint(input, openAiDescriptor);
    const bfl = generationRequestFingerprint(input, bflDescriptor);
    const wiro = generationRequestFingerprint(input, wiroDescriptor);
    const saferBfl = generationRequestFingerprint(input, {
      ...bflDescriptor,
      effectiveSettings: { safetyTolerance: 3, disablePromptUpsampling: true },
    });

    expect(openAi).not.toBe(bfl);
    expect(openAi).not.toBe(wiro);
    expect(bfl).not.toBe(wiro);
    expect(bfl).not.toBe(saferBfl);
  });

  it('accepts a legacy OpenAI fingerprint only under the matching active provider and model', () => {
    const legacyFingerprint = generationRequestFingerprint(input);
    const metadata = {
      source: 'generated',
      provider: 'openai',
      model: 'gpt-image-2',
      requestFingerprint: legacyFingerprint,
    } as StoredReferenceImageMetadata;

    expect(() =>
      assertMatchingRequestFingerprint(
        metadata,
        generationRequestFingerprint(input, openAiDescriptor),
        { legacyFingerprint, descriptor: openAiDescriptor },
      ),
    ).not.toThrow();
    try {
      assertMatchingRequestFingerprint(
        metadata,
        generationRequestFingerprint(input, bflDescriptor),
        { legacyFingerprint, descriptor: bflDescriptor },
      );
      throw new Error('Expected a request-id conflict.');
    } catch (error) {
      expect(error).toMatchObject({ reason: 'request-id-conflict' });
    }
  });
});
