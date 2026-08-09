import { describe, expect, it, vi } from 'vitest';
import { testConfig } from '../../test/fakes.js';
import type { ProviderFetch } from '../transport/provider-fetch.js';
import { BflFlux2ReferenceImageProvider } from '../bfl/flux2-reference-image-provider.js';
import { OpenAIReferenceImageProvider } from '../openai/reference-image-provider.js';
import { WiroSeedreamReferenceImageProvider } from '../wiro/seedream-reference-image-provider.js';
import {
  configuredReferenceImageDescriptor,
  createConfiguredReferenceImageProvider,
} from './provider-factory.js';

describe('reference image provider factory', () => {
  it('defaults to OpenAI and never falls back when its selected credential is missing', () => {
    expect(createConfiguredReferenceImageProvider(testConfig())).toBeNull();
    expect(
      createConfiguredReferenceImageProvider(
        testConfig({ openAiApiKey: 'openai-secret', bflApiKey: 'bfl-secret' }),
      ),
    ).toBeInstanceOf(OpenAIReferenceImageProvider);
  });

  it('constructs only BFL when selected and reports its authoritative descriptor', () => {
    const config = testConfig({
      referenceImageProvider: 'bfl',
      openAiApiKey: 'optimizer-only-openai-secret',
      bflApiKey: 'bfl-secret',
      bflSafetyTolerance: 3,
      bflDisablePromptUpsampling: false,
    });
    expect(createConfiguredReferenceImageProvider(config)).toBeInstanceOf(
      BflFlux2ReferenceImageProvider,
    );
    expect(configuredReferenceImageDescriptor(config)).toEqual({
      providerId: 'bfl',
      modelId: 'flux-2-pro',
      adapterVersion: 'bfl-flux-2-pro-v1',
      effectiveSettings: {
        safetyTolerance: 3,
        disablePromptUpsampling: false,
      },
    });
    expect(
      createConfiguredReferenceImageProvider(
        testConfig({
          referenceImageProvider: 'bfl',
          openAiApiKey: 'optimizer-only-openai-secret',
        }),
      ),
    ).toBeNull();
  });

  it('carries the selected BFL safety configuration through the factory to the wire request', async () => {
    const fetchImplementation = vi.fn<ProviderFetch>().mockResolvedValue(
      new Response('{}', {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const provider = createConfiguredReferenceImageProvider(
      testConfig({
        referenceImageProvider: 'bfl',
        bflApiKey: 'bfl-secret',
        bflSafetyTolerance: 3,
        bflDisablePromptUpsampling: false,
      }),
      { fetchImplementation },
    );
    if (provider === null) throw new TypeError('Expected the configured BFL provider.');

    await expect(
      provider.generate({
        prompt: 'A precise character reference.',
        size: '1024x1536',
        format: 'webp',
      }),
    ).rejects.toMatchObject({
      providerId: 'bfl',
      reason: 'authentication',
      upstreamStatus: 401,
    });

    expect(fetchImplementation).toHaveBeenCalledOnce();
    const body = fetchImplementation.mock.calls[0]?.[1]?.body;
    if (typeof body !== 'string') throw new TypeError('Expected a JSON request body.');
    expect(JSON.parse(body)).toMatchObject({
      safety_tolerance: 3,
      disable_pup: false,
    });
  });

  it('constructs only Wiro when both signature credentials exist', () => {
    const config = testConfig({
      referenceImageProvider: 'wiro',
      openAiApiKey: 'optimizer-only-openai-secret',
      bflApiKey: 'unused-bfl-secret',
      wiroApiKey: 'wiro-key',
      wiroApiSecret: 'wiro-secret',
    });
    expect(createConfiguredReferenceImageProvider(config)).toBeInstanceOf(
      WiroSeedreamReferenceImageProvider,
    );
    expect(configuredReferenceImageDescriptor(config)).toEqual({
      providerId: 'wiro',
      modelId: 'seedream-v5-lite-uncensored',
      adapterVersion: 'wiro-seedream-v5-lite-v1',
      effectiveSettings: {
        owner: 'ByteDance',
        resolution: '2k',
        maxImages: 1,
        watermark: false,
      },
    });
    expect(
      createConfiguredReferenceImageProvider(
        testConfig({
          referenceImageProvider: 'wiro',
          openAiApiKey: 'optimizer-only-openai-secret',
          wiroApiKey: 'wiro-key-without-secret',
        }),
      ),
    ).toBeNull();
    expect(
      createConfiguredReferenceImageProvider(
        testConfig({
          referenceImageProvider: 'wiro',
          openAiApiKey: 'optimizer-only-openai-secret',
          wiroApiSecret: 'wiro-secret-without-key',
        }),
      ),
    ).toBeNull();
  });
});
