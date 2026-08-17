// @vitest-environment jsdom

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RecipeSelection } from '../../features/creative-assets/RecipeShelf.types';
import type { StudioRuntimePorts } from './studioHandoff';
import { useStudioHandoff } from './useStudioHandoff';

afterEach(cleanup);

const selection: RecipeSelection = {
  origin: 'character-prompt',
  prompt: 'A calm narrator in a grey studio',
  modelModeId: 'lucy-latest',
  assetId: 'b5b6f0d1-4a5a-4f8b-9a1e-7f5f0f0f0f01',
  characterName: 'Narrator',
  referenceImageAssetId: null,
};

const runtimePorts = (overrides: Partial<StudioRuntimePorts> = {}): StudioRuntimePorts => ({
  applyRecipe: vi.fn(),
  selectVoice: vi.fn(),
  existingVideoCharacter: {
    providerActive: false,
    hasSelection: false,
    isCharacterSwapStep: () => false,
    applyCharacterToStep: () => Promise.resolve(),
  },
  useSavedVideo: vi.fn(),
  checkpointProjectCreative: () => Promise.resolve(true),
  saveStudioCharacter: () => Promise.resolve(),
  ...overrides,
});

const renderHandoff = (runtimeRouteActive = false, openStudio = vi.fn()) => {
  const view = renderHook(
    ({ active }: { active: boolean }) =>
      useStudioHandoff({ runtimeRouteActive: active, openStudio }),
    { initialProps: { active: runtimeRouteActive } },
  );
  return { ...view, openStudio };
};

describe('useStudioHandoff', () => {
  it('applies straight to a mounted runtime without holding anything', () => {
    const applyRecipe = vi.fn();
    const ports = runtimePorts({ applyRecipe });
    const { result, openStudio } = renderHandoff(true);

    act(() => result.current.registerPorts(ports));
    act(() => result.current.applyRecipe(selection));

    expect(applyRecipe).toHaveBeenCalledWith(selection);
    expect(openStudio).toHaveBeenCalledOnce();
    expect(result.current.pending).toBeNull();
  });

  it('holds a selection made where no runtime is mounted, then navigates to one', () => {
    const { result, openStudio } = renderHandoff(false);

    act(() => result.current.applyRecipe(selection));

    expect(result.current.pending).toEqual({ kind: 'use-recipe', selection });
    expect(openStudio).toHaveBeenCalledOnce();
  });

  it('reads ports at call time, so a destination chosen before the runtime existed still lands', () => {
    const applyRecipe = vi.fn();
    const { result } = renderHandoff(false);

    // Registration happens after the caller already has its handle on the channel — the case a
    // captured closure would get wrong.
    act(() => result.current.registerPorts(runtimePorts({ applyRecipe })));
    act(() => result.current.applyRecipe(selection));

    expect(applyRecipe).toHaveBeenCalledWith(selection);
    expect(result.current.pending).toBeNull();
  });

  it('stops routing into a runtime that has unmounted', () => {
    const applyRecipe = vi.fn();
    const { result } = renderHandoff(true);

    act(() => result.current.registerPorts(runtimePorts({ applyRecipe })));
    act(() => result.current.registerPorts(null));
    act(() => result.current.applyRecipe(selection));

    expect(applyRecipe).not.toHaveBeenCalled();
    expect(result.current.pending).toEqual({ kind: 'use-recipe', selection });
  });

  it('holds a Voice for the source surface rather than navigating on its own', () => {
    const { result, openStudio } = renderHandoff(false);

    act(() => result.current.selectVoice('voice-1', 'Aria'));

    expect(result.current.pending).toEqual({
      kind: 'preselect-voice',
      voiceId: 'voice-1',
      voiceName: 'Aria',
    });
    expect(openStudio).not.toHaveBeenCalled();
  });

  it('drops an undrained selection once the operator leaves Studio again', () => {
    const { result, rerender } = renderHandoff(false);

    act(() => result.current.applyRecipe(selection));
    rerender({ active: true });
    expect(result.current.pending).toEqual({ kind: 'use-recipe', selection });

    // Left without the runtime ever draining it: applying on some later visit would be an action
    // the operator did not ask for.
    rerender({ active: false });
    expect(result.current.pending).toBeNull();
  });
});
