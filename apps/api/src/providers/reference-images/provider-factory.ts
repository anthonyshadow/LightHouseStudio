import type { RuntimeConfig } from '../../config/environment.js';
import {
  BflFlux2ReferenceImageProvider,
  type BflLifecycleObserver,
} from '../bfl/flux2-reference-image-provider.js';
import { OpenAIReferenceImageProvider } from '../openai/reference-image-provider.js';
import {
  WiroSeedreamReferenceImageProvider,
  type WiroLifecycleObserver,
} from '../wiro/seedream-reference-image-provider.js';
import type { ProviderFetch } from '../transport/provider-fetch.js';
import type {
  ReferenceImageProvider,
  ReferenceImageProviderDescriptor,
} from './reference-image-provider.js';

export const createConfiguredReferenceImageProvider = (
  config: RuntimeConfig,
  options: {
    readonly fetchImplementation?: ProviderFetch;
    readonly observeBflLifecycle?: BflLifecycleObserver;
    readonly observeWiroLifecycle?: WiroLifecycleObserver;
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
  if (config.referenceImageProvider === 'wiro') {
    if (config.wiroApiKey === undefined || config.wiroApiSecret === undefined) return null;
    return new WiroSeedreamReferenceImageProvider(config.wiroApiKey, config.wiroApiSecret, {
      model: config.wiroReferenceImageModel,
      timeoutMs: config.wiroReferenceImageTimeoutMs,
      ...(options.fetchImplementation === undefined
        ? {}
        : { fetchImplementation: options.fetchImplementation }),
      ...(options.observeWiroLifecycle === undefined
        ? {}
        : { observeLifecycle: options.observeWiroLifecycle }),
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
  if (config.referenceImageProvider === 'wiro') {
    return {
      providerId: 'wiro',
      modelId: config.wiroReferenceImageModel,
      adapterVersion: 'wiro-seedream-v5-lite-v1',
      effectiveSettings: {
        owner: 'ByteDance',
        resolution: '2k',
        maxImages: 1,
        watermark: false,
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
