import type { RuntimeConfig } from '../../config/environment.js';
import { DecartHttpVideoJobProvider } from '../decart/video-job-provider.js';
import { PrunaVideoReplaceProvider } from '../pruna/video-replace-provider.js';
import type {
  ExistingVideoJobProvider,
  ExistingVideoOperationBinding,
  ExistingVideoProviderRegistry,
} from './video-job-provider.js';

export interface ExistingVideoProviderFactoryOptions {
  readonly fetchImplementation?: typeof fetch;
  readonly decartProvider?: ExistingVideoJobProvider | null;
  readonly prunaProvider?: ExistingVideoJobProvider | null;
  readonly createPrunaProvider?: (
    apiKey: string,
    fetchImplementation?: typeof fetch,
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

  let characterSwap: ExistingVideoOperationBinding | null = null;
  if (config.existingVideoCharacterSwapProvider === 'decart') {
    characterSwap = decart === null ? null : decartBinding(decart);
  } else {
    const pruna =
      options.prunaProvider !== undefined
        ? options.prunaProvider
        : (
            options.createPrunaProvider ??
            ((apiKey, fetchImplementation) =>
              new PrunaVideoReplaceProvider(apiKey, fetchImplementation))
          )(config.prunaApiKey!, options.fetchImplementation);
    characterSwap =
      pruna === null
        ? null
        : {
            provider: pruna,
            outputResolutions: ['720p', '1080p'],
            defaultOutputResolution: '720p',
            outputSizing: 'megapixel-budget',
            inputPreparation: 'h264-mp4',
            referencePolicy: 'required',
            promptInput: 'server-default',
            promptEnhancement: false,
            terminalFailureRelease: 'explicit-user',
          };
  }

  return {
    'character-swap': characterSwap,
    'virtual-try-on': decart === null ? null : decartBinding(decart),
  };
};
