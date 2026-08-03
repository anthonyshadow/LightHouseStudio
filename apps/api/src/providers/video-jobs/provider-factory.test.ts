import { describe, expect, it, vi } from 'vitest';
import { testConfig } from '../../test/fakes.js';
import type { ExistingVideoJobProvider } from './video-job-provider.js';
import { createExistingVideoProviderRegistry } from './provider-factory.js';

const provider = (): ExistingVideoJobProvider => ({}) as ExistingVideoJobProvider;

describe('createExistingVideoProviderRegistry', () => {
  it('defaults Character Swap and Virtual Try-On to Decart when configured', () => {
    const decart = provider();
    const createPrunaProvider = vi.fn();
    const registry = createExistingVideoProviderRegistry(
      testConfig({ decartApiKey: 'decart-secret' }),
      { decartProvider: decart, createPrunaProvider },
    );

    expect(registry['character-swap']).toMatchObject({
      provider: decart,
      outputResolution: '720p',
      outputSizing: 'exact-canonical',
      inputPreparation: 'none',
      referencePolicy: 'optional',
      promptEnhancement: true,
      terminalFailureRelease: 'automatic',
    });
    expect(registry['virtual-try-on']?.provider).toBe(decart);
    expect(createPrunaProvider).not.toHaveBeenCalled();
  });

  it('does not construct unselected Pruna even when its values are present', () => {
    const createPrunaProvider = vi.fn();
    createExistingVideoProviderRegistry(
      testConfig({
        existingVideoCharacterSwapProvider: 'decart',
        prunaVideoReplaceEnabled: true,
        prunaApiKey: 'unused-secret',
        prunaVideoReplaceModel: 'p-video-replace',
        prunaVideoReplaceResolution: '1080p',
      }),
      { decartProvider: null, createPrunaProvider },
    );

    expect(createPrunaProvider).not.toHaveBeenCalled();
  });

  it.each(['720p', '1080p'] as const)(
    'routes only Character Swap to selected Pruna at %s',
    (resolution) => {
      const decart = provider();
      const pruna = provider();
      const createPrunaProvider = vi.fn(() => pruna);
      const registry = createExistingVideoProviderRegistry(
        testConfig({
          decartApiKey: 'decart-secret',
          existingVideoCharacterSwapProvider: 'pruna',
          prunaVideoReplaceEnabled: true,
          prunaApiKey: 'pruna-secret',
          prunaVideoReplaceModel: 'p-video-replace',
          prunaVideoReplaceResolution: resolution,
        }),
        { decartProvider: decart, createPrunaProvider },
      );

      expect(createPrunaProvider).toHaveBeenCalledOnce();
      expect(createPrunaProvider).toHaveBeenCalledWith('pruna-secret', resolution, undefined);
      expect(registry['character-swap']).toMatchObject({
        provider: pruna,
        outputResolution: resolution,
        outputSizing: 'megapixel-budget',
        inputPreparation: 'h264-mp4',
        referencePolicy: 'required',
        promptEnhancement: false,
        terminalFailureRelease: 'explicit-user',
      });
      expect(registry['virtual-try-on']?.provider).toBe(decart);
    },
  );
});
