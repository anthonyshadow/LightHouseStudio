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
  useSavedVideo: vi.fn(() => Promise.resolve()),
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
  it('reaches a mounted runtime immediately', () => {
    const applyRecipe = vi.fn();
    const { result, openStudio } = renderHandoff(true);

    act(() => result.current.registerPorts(runtimePorts({ applyRecipe })));
    act(() => result.current.applyRecipe(selection));

    expect(applyRecipe).toHaveBeenCalledWith(selection);
    expect(openStudio).toHaveBeenCalledOnce();
  });

  it('runs a selection made with no runtime as soon as one registers', () => {
    const applyRecipe = vi.fn();
    const { result, openStudio } = renderHandoff(false);

    act(() => result.current.applyRecipe(selection));
    expect(applyRecipe).not.toHaveBeenCalled();
    expect(openStudio).toHaveBeenCalledOnce();

    act(() => result.current.registerPorts(runtimePorts({ applyRecipe })));

    expect(applyRecipe).toHaveBeenCalledWith(selection);
  });

  it('drains a held call exactly once, even if the runtime re-registers', () => {
    const applyRecipe = vi.fn();
    const { result } = renderHandoff(false);

    act(() => result.current.applyRecipe(selection));
    act(() => result.current.registerPorts(runtimePorts({ applyRecipe })));
    // Re-registration happens on every dependency change in the runtime's layout effect; applying
    // the same selection again would be an action the operator asked for once.
    act(() => result.current.registerPorts(runtimePorts({ applyRecipe })));

    expect(applyRecipe).toHaveBeenCalledOnce();
  });

  it('reads ports at call time, so a runtime that arrived later still receives the call', () => {
    const applyRecipe = vi.fn();
    const { result } = renderHandoff(false);

    act(() => result.current.registerPorts(runtimePorts({ applyRecipe })));
    act(() => result.current.applyRecipe(selection));

    expect(applyRecipe).toHaveBeenCalledWith(selection);
  });

  it('holds rather than calling into a runtime that has unmounted', () => {
    const applyRecipe = vi.fn();
    const later = vi.fn();
    const { result } = renderHandoff(true);

    act(() => result.current.registerPorts(runtimePorts({ applyRecipe })));
    act(() => result.current.registerPorts(null));
    act(() => result.current.applyRecipe(selection));
    expect(applyRecipe).not.toHaveBeenCalled();

    act(() => result.current.registerPorts(runtimePorts({ applyRecipe: later })));
    expect(later).toHaveBeenCalledWith(selection);
  });

  it('leaves navigation to the caller when a Voice is chosen', () => {
    const selectVoice = vi.fn();
    const { result, openStudio } = renderHandoff(true);

    act(() => result.current.registerPorts(runtimePorts({ selectVoice })));
    act(() => result.current.selectVoice('voice-1', 'Aria'));

    expect(selectVoice).toHaveBeenCalledWith('voice-1', 'Aria');
    expect(openStudio).not.toHaveBeenCalled();
  });

  it('drops an undrained call once the operator leaves Studio again', () => {
    const applyRecipe = vi.fn();
    const { result, rerender } = renderHandoff(false);

    act(() => result.current.applyRecipe(selection));
    rerender({ active: true });

    // Left without the runtime ever draining it: running it on some later visit would be an action
    // the operator did not ask for.
    rerender({ active: false });
    act(() => result.current.registerPorts(runtimePorts({ applyRecipe })));

    expect(applyRecipe).not.toHaveBeenCalled();
  });
});
