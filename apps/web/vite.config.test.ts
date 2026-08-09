import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { transformFileAsync } from '@babel/core';
import { describe, expect, it } from 'vitest';
import {
  default as viteConfig,
  DEVELOPMENT_API_PROXY,
  DEVELOPMENT_API_PROXY_TIMEOUT_MS,
  DEVELOPMENT_OPTIMIZE_DEPS,
  PRODUCTION_CHUNK_SIZE_WARNING_LIMIT_KB,
  REACT_COMPILER_OPTIONS,
  REACT_COMPILER_PRESET,
} from './vite.config';

const compilerBoundaries = [
  ['./src/features/video-gallery/VideoGallery.tsx', 1],
  ['./src/features/voice-effects/VoiceEffectsPanel.tsx', 1],
  ['./src/features/voice-effects/VoiceList.tsx', 1],
  ['./src/features/account-library/SavedCreativeLibrary.tsx', 2],
  ['./src/features/character-wardrobe/CharacterVersionSelector.tsx', 1],
  ['./src/features/creative-assets/RecipeShelf.tsx', 1],
  ['./src/features/creative-assets/SavedRecipeList.tsx', 1],
  ['./src/features/creative-assets/CharacterRecipeList.tsx', 1],
  ['./src/features/creative-assets/RecentRecipeList.tsx', 1],
  ['./src/features/creative-assets/RecipeCards.tsx', 3],
  ['./src/features/creative-assets/OutfitSelector.tsx', 1],
  ['./src/features/creative-assets/RecipeShelfToolbar.tsx', 1],
  ['./src/features/existing-video/ExistingVideoPhaseIndicator.tsx', 1],
  ['./src/features/existing-video/ExistingVideoRecipeChooser.tsx', 1],
  ['./src/features/existing-video/ExistingVideoToolCards.tsx', 1],
  ['./src/features/existing-video/ExistingVideoVisualEditor.tsx', 1],
  ['./src/features/character-builder/CharacterVisualChoiceSection.tsx', 2],
  ['./src/features/character-builder/CharacterDirectionPreview.tsx', 1],
  ['./src/features/video-editor/VideoEditStagePreview.tsx', 1],
  ['./src/features/recording/CaptureSettingsPanel.tsx', 1],
  ['./src/features/live-stage/StageNoticeLayer.tsx', 1],
  ['./src/features/live-stage/MediaStageSections.tsx', 1],
  ['./src/features/prompt-authoring/PromptFeedback.tsx', 1],
  ['./src/features/prompt-authoring/PromptWorkshopSections.tsx', 2],
  ['./src/ui/primitives/SegmentedControl.tsx', 1],
] as const;

const resolveViteConfig = (command: 'build' | 'serve') =>
  typeof viteConfig === 'function'
    ? viteConfig({ command, mode: 'test', isSsrBuild: false, isPreview: false })
    : viteConfig;

describe('development API proxy', () => {
  it('preserves the browser-facing Host for exact local Origin validation', () => {
    expect(DEVELOPMENT_API_PROXY).toEqual({
      target: 'http://127.0.0.1:4100',
      changeOrigin: false,
      proxyTimeout: DEVELOPMENT_API_PROXY_TIMEOUT_MS,
    });
    expect(DEVELOPMENT_API_PROXY_TIMEOUT_MS).toBe(300_000);
  });
});

describe('development dependency optimization', () => {
  it('pre-bundles the lazily loaded MediaBunny remuxer before a voice conversion requests it', () => {
    const resolvedConfig = resolveViteConfig('serve');

    expect(DEVELOPMENT_OPTIMIZE_DEPS).toEqual({ include: ['mediabunny'] });
    expect(resolvedConfig.optimizeDeps).toEqual(DEVELOPMENT_OPTIMIZE_DEPS);
  });
});

describe('React Compiler adoption', () => {
  it('limits compilation to reviewed presentation boundaries', async () => {
    const resolvedConfig = resolveViteConfig('build');
    const configuredPlugins = await Promise.all(
      (resolvedConfig.plugins ?? []).flat().map((plugin) => Promise.resolve(plugin)),
    );

    expect(REACT_COMPILER_OPTIONS).toEqual({ compilationMode: 'annotation' });
    expect(REACT_COMPILER_PRESET.rolldown.filter?.code).toEqual(/['"]use memo['"]/);
    expect(REACT_COMPILER_PRESET.rolldown.optimizeDeps?.include).toEqual([
      'react/compiler-runtime',
    ]);
    expect(configuredPlugins).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: '@rolldown/plugin-babel' })]),
    );
  });

  it('emits compiler-runtime memoization for every reviewed boundary', async () => {
    for (const [relativePath, expectedBoundaryCount] of compilerBoundaries) {
      const sourcePath = fileURLToPath(new URL(relativePath, import.meta.url));
      const source = await readFile(sourcePath, 'utf8');
      const result = await transformFileAsync(sourcePath, {
        babelrc: false,
        configFile: false,
        parserOpts: { plugins: ['typescript', 'jsx'] },
        presets: [REACT_COMPILER_PRESET.preset],
      });
      const compiledCode = result?.code ?? '';

      expect(source.match(/['"]use memo['"]/g), relativePath).toHaveLength(expectedBoundaryCount);
      expect(compiledCode, relativePath).toContain('react/compiler-runtime');
      expect(compiledCode.match(/\b_c\d*\(/g), relativePath).toHaveLength(expectedBoundaryCount);
    }
  });
});

describe('production chunk reporting', () => {
  it('allows the known lazy media and worker boundary while retaining manifest budgets', () => {
    const resolvedConfig = resolveViteConfig('build');

    expect(PRODUCTION_CHUNK_SIZE_WARNING_LIMIT_KB).toBe(1_700);
    expect(resolvedConfig.build?.chunkSizeWarningLimit).toBe(
      PRODUCTION_CHUNK_SIZE_WARNING_LIMIT_KB,
    );
    expect(resolvedConfig.build?.manifest).toBe(true);
  });
});
