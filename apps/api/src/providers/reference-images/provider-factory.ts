import type { RuntimeConfig } from '../../config/environment.js';
import {
  BflFlux2ReferenceImageProvider,
  type BflLifecycleObserver,
} from '../bfl/flux2-reference-image-provider.js';
import { OpenAIReferenceImageProvider } from '../openai/reference-image-provider.js';
import type {
  ReferenceImageProvider,
  ReferenceImageProviderDescriptor,
} from './reference-image-provider.js';

export const createConfiguredReferenceImageProvider = (
  config: RuntimeConfig,
  options: {
    readonly fetchImplementation?: typeof fetch;
    readonly observeBflLifecycle?: BflLifecycleObserver;
  } = {},
): ReferenceImageProvider | null => {
  if (config.referenceImageProvider === 'bfl') {
    if (config.bflApiKey === undefined) return null;
    return new BflFlux2ReferenceImageProvider(config.bflApiKey, {
      model: config.bflReferenceImageModel,
      timeoutMs: config.bflReferenceImageTimeoutMs,
      safetyTolerance: config.bflSafetyTolerance,
      disablePromptUpsampling: config.bflDisablePromptUpsampling,
      ...(options.fetchImplementation === undefined
        ? {}
        : { fetchImplementation: options.fetchImplementation }),
      ...(options.observeBflLifecycle === undefined
        ? {}
        : { observeLifecycle: options.observeBflLifecycle }),
    });
  }
  if (config.openAiApiKey === undefined) return null;
  return new OpenAIReferenceImageProvider(config.openAiApiKey, {
    model: config.openAiReferenceImageModel,
    quality: config.openAiReferenceImageQuality,
    timeoutMs: config.referenceImageTimeoutMs,
  });
};

export const configuredReferenceImageDescriptor = (
  config: RuntimeConfig,
): ReferenceImageProviderDescriptor => {
  if (config.referenceImageProvider === 'bfl') {
    return {
      providerId: 'bfl',
      modelId: config.bflReferenceImageModel,
      adapterVersion: 'bfl-flux-2-pro-v1',
      effectiveSettings: {
        safetyTolerance: config.bflSafetyTolerance,
        disablePromptUpsampling: config.bflDisablePromptUpsampling,
      },
    };
  }
  return {
    providerId: 'openai',
    modelId: config.openAiReferenceImageModel,
    adapterVersion: 'openai-gpt-image-v1',
    effectiveSettings: {
      quality: config.openAiReferenceImageQuality,
      background: 'opaque',
      moderation: 'low',
      outputCompression: 90,
    },
  };
};
