import { describe, expect, it } from 'vitest';
import { testConfig } from '../../test/fakes.js';
import { BflFlux2ReferenceImageProvider } from '../bfl/flux2-reference-image-provider.js';
import { OpenAIReferenceImageProvider } from '../openai/reference-image-provider.js';
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
});
