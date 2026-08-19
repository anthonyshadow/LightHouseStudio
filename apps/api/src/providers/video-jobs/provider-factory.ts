import type { RuntimeConfig } from '../../config/environment.js';
import { DecartHttpVideoJobProvider } from '../decart/video-job-provider.js';
import { PrunaVideoReplaceProvider } from '../pruna/video-replace-provider.js';
import type { ProviderFetch } from '../transport/provider-fetch.js';
import type {
  ExistingVideoJobProvider,
  ExistingVideoOperationBinding,
  ExistingVideoProviderRegistry,
} from './video-job-provider.js';

export interface ExistingVideoProviderFactoryOptions {
  readonly fetchImplementation?: ProviderFetch;
  readonly decartProvider?: ExistingVideoJobProvider | null;
  readonly prunaProvider?: ExistingVideoJobProvider | null;
  readonly createPrunaProvider?: (
    apiKey: string,
    fetchImplementation?: ProviderFetch,
    disableSafetyChecker?: boolean,
  ) => ExistingVideoJobProvider;
}

const decartBinding = (provider: ExistingVideoJobProvider): ExistingVideoOperationBinding => ({
  provider,
  outputResolutions: ['720p'],
  defaultOutputResolution: '720p',
  outputSizing: 'exact-canonical',
  inputPreparation: 'none',
  referencePolicy: 'optional',
  promptInput: 'editable',
  promptEnhancement: true,
  terminalFailureRelease: 'automatic',
});

export const createExistingVideoProviderRegistry = (
  config: RuntimeConfig,
  options: ExistingVideoProviderFactoryOptions = {},
): ExistingVideoProviderRegistry => {
  const decart =
    options.decartProvider !== undefined
      ? options.decartProvider
      : config.decartApiKey === undefined
        ? null
        : new DecartHttpVideoJobProvider(config.decartApiKey, options.fetchImplementation);

  const pruna = config.prunaVideoReplaceEnabled
    ? options.prunaProvider !== undefined
      ? options.prunaProvider
      : (
          options.createPrunaProvider ??
          ((apiKey, fetchImplementation, disableSafetyChecker) =>
            new PrunaVideoReplaceProvider(
              apiKey,
              fetchImplementation,
              undefined,
              disableSafetyChecker,
            ))
        )(
          config.prunaApiKey!,
          options.fetchImplementation,
          config.prunaVideoReplaceDisableSafetyChecker,
        )
    : null;

  const characterSwap: ExistingVideoProviderRegistry['characterSwap'] = {
    ...(decart === null ? {} : { decart: decartBinding(decart) }),
    ...(pruna === null
      ? {}
      : {
          pruna: {
            provider: pruna,
            outputResolutions: ['720p', '1080p'],
            defaultOutputResolution: '720p',
            outputSizing: 'megapixel-budget',
            inputPreparation: 'h264-mp4',
            referencePolicy: 'required',
            promptInput: 'server-default',
            promptEnhancement: false,
            terminalFailureRelease: 'explicit-user',
          },
        }),
  };

  return {
    characterSwap,
    defaultCharacterSwapProvider: config.existingVideoCharacterSwapProvider,
    virtualTryOn: decart === null ? null : decartBinding(decart),
  };
};
