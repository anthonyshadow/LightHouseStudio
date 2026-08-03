import type { ExistingVideoStep, ExistingVideoWorkflow } from './useExistingVideoWorkflow';

export type ExistingVideoEditorPhase = 'source' | 'edit' | 'review';
export type ExistingVideoToolId = 'character' | 'vton' | 'voice';
export type ExistingVideoVisualToolId = Exclude<ExistingVideoToolId, 'voice'>;

export const existingVideoEditorPhase = (
  workflow: Pick<ExistingVideoWorkflow, 'selection' | 'phase'>,
): ExistingVideoEditorPhase => {
  if (!workflow.selection) return 'source';
  return workflow.phase === 'complete' ? 'review' : 'edit';
};

export const existingVideoStepIsComplete = (
  step: ExistingVideoStep,
  referenceRequired = false,
): boolean => {
  if (step.modelId === 'lucy-latest') {
    return referenceRequired
      ? step.referenceImage !== null
      : Boolean(step.prompt.trim() || step.referenceImage);
  }
  if (step.inputKind === 'prompt') return Boolean(step.prompt.trim());
  if (step.inputKind === 'reference-image') return step.referenceImage !== null;
  return Boolean(step.savedRecipeId || step.referenceImage || step.prompt.trim());
};

export const toolForStep = (
  step: ExistingVideoStep | undefined,
): ExistingVideoVisualToolId | null => {
  if (!step) return null;
  return step.modelId === 'lucy-latest' ? 'character' : 'vton';
};

export const visualToolName = (tool: ExistingVideoVisualToolId): string =>
  tool === 'character' ? 'Character Swap' : 'Virtual Try On';

export const visualStepHasSettings = (step: ExistingVideoStep): boolean =>
  Boolean(
    step.savedRecipeId ||
    step.prompt.trim() ||
    step.enhancePrompt ||
    step.referenceImage ||
    (step.modelId === 'lucy-vton-latest' && step.inputKind !== 'prompt'),
  );

export const visualToolLabel = (step: ExistingVideoStep): string =>
  step.modelId === 'lucy-latest' ? 'Character Swap' : 'Virtual Try On';

export const toolStatus = (
  tool: ExistingVideoToolId,
  workflow: Pick<
    ExistingVideoWorkflow,
    'steps' | 'voiceAvailable' | 'voiceSelection' | 'phase' | 'active' | 'completedStepCount'
  >,
): string => {
  const step = workflow.steps[0];
  const stepTool = toolForStep(step);
  if (tool === 'voice') {
    if (!workflow.voiceAvailable) return 'Unavailable';
    if (workflow.active && workflow.phase === 'voice-processing') return 'Processing';
    if (workflow.phase === 'complete' && workflow.voiceSelection) return 'Applied';
    return workflow.voiceSelection ? 'Ready' : 'Optional';
  }
  if (workflow.active && stepTool === tool) return 'Processing';
  if (workflow.phase === 'complete' && stepTool === tool && workflow.completedStepCount > 0) {
    return 'Applied';
  }
  if (stepTool !== tool || !step) return 'Available';
  return existingVideoStepIsComplete(step) ? 'Ready' : 'Needs setup';
};

export const planSummary = (
  workflow: Pick<ExistingVideoWorkflow, 'steps' | 'voiceSelection'>,
): { title: string; detail: string } => {
  const step = workflow.steps[0];
  const voice = workflow.voiceSelection;
  if (step && voice) {
    const provider =
      voice.kind === 'local' ? 'a local voice treatment' : 'one ElevenLabs conversion';
    return {
      title: `${visualToolLabel(step)}, then ${voice.voiceName}`,
      detail: `One visual-processing submission followed by ${provider}.`,
    };
  }
  if (step) {
    return {
      title: visualToolLabel(step),
      detail: 'One visual-processing submission. No automatic billable retry.',
    };
  }
  if (voice) {
    return {
      title: voice.voiceName,
      detail:
        voice.kind === 'local'
          ? 'Processed locally in this browser. No provider transfer.'
          : 'One ElevenLabs conversion using the original audio only.',
    };
  }
  return {
    title: 'No edits selected',
    detail: 'Keep the video local and continue to review and download.',
  };
};
