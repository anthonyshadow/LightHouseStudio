import { useCallback, useLayoutEffect, useMemo } from 'react';
import { hydrateReferenceImage } from '../adapters/api-client/apiClient';
import type { ExistingVideoCharacterPort, StudioRuntimePorts } from '../app/shell/studioHandoff';
import type { useStudioHandoff } from '../app/shell/useStudioHandoff';
import { savedCharacterStepInput } from '../features/existing-video/useExistingVideoWorkflow';
import type { useExistingVideoWorkflow } from '../features/existing-video/useExistingVideoWorkflow';
import type { useProjectCreativeSessionAdapter } from '../features/projects/useProjectCreativeSessionAdapter';
import type { useStudioSavedVideoController } from './useStudioSavedVideoController';

interface UseStudioRuntimePortsOptions {
  readonly registerPorts: ReturnType<typeof useStudioHandoff>['registerPorts'];
  readonly existingVideo: ReturnType<typeof useExistingVideoWorkflow>;
  readonly applyRecipe: StudioRuntimePorts['applyRecipe'];
  readonly savedVideo: ReturnType<typeof useStudioSavedVideoController>;
  readonly projectCreative: ReturnType<typeof useProjectCreativeSessionAdapter>;
  readonly saveStudioCharacter: StudioRuntimePorts['saveStudioCharacter'];
}

/**
 * Publishes this runtime's ports to the surfaces that outlive it.
 *
 * Registered in a layout effect so a selection made on the route that mounted the runtime is
 * applied before first paint, and withdrawn on unmount so the shell holds a selection instead of
 * calling into a torn-down session.
 */
export const useStudioRuntimePorts = ({
  registerPorts,
  existingVideo,
  applyRecipe,
  savedVideo,
  projectCreative,
  saveStudioCharacter,
}: UseStudioRuntimePortsOptions): void => {
  const selectVoice = useCallback(
    (voiceId: string, voiceName: string) => {
      if (existingVideo.selection === null) existingVideo.preselectVoice(voiceId, voiceName);
      else existingVideo.selectVoice(voiceId, voiceName);
    },
    [existingVideo],
  );
  const existingVideoCharacter = useMemo<ExistingVideoCharacterPort>(
    () => ({
      providerActive: existingVideo.providerActive,
      hasSelection: existingVideo.selection !== null,
      isCharacterSwapStep: (stepId) =>
        existingVideo.steps.some(
          (candidate) => candidate.id === stepId && candidate.modelId === 'lucy-latest',
        ),
      applyCharacterToStep: async (stepId, snapshot, characterId) => {
        const reference = snapshot.referenceImage
          ? await hydrateReferenceImage(snapshot.referenceImage.assetId, snapshot.referenceImage)
          : null;
        existingVideo.updateStep(stepId, {
          savedRecipeId: characterId,
          characterName: snapshot.name,
          characterVariantName: null,
          ...savedCharacterStepInput(snapshot.prompt, reference?.file ?? null),
        });
      },
    }),
    [existingVideo],
  );
  useLayoutEffect(() => {
    registerPorts({
      applyRecipe,
      selectVoice,
      existingVideoCharacter,
      useSavedVideo: (video, intent) => savedVideo.useSavedVideo(video, intent),
      checkpointProjectCreative: () => projectCreative.checkpoint(),
      saveStudioCharacter,
    });
    return () => registerPorts(null);
  }, [
    applyRecipe,
    existingVideoCharacter,
    projectCreative,
    registerPorts,
    saveStudioCharacter,
    savedVideo,
    selectVoice,
  ]);
};
