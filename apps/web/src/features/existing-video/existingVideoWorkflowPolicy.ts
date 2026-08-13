import type {
  CapabilitiesResponse,
  VideoTransformModelId,
  VideoTransformOperationId,
} from '@studio/contracts';
import { ApiClientError } from '../../adapters/api-client/apiClient';
import type { ExistingVideoStep } from './existingVideoWorkflowTypes';

export const savedCharacterStepInput = (
  prompt: string,
  referenceImage: File | null,
): Pick<ExistingVideoStep, 'prompt' | 'referenceImage'> => ({
  prompt: referenceImage ? '' : prompt,
  referenceImage,
});

export const operationForModel = (modelId: VideoTransformModelId): VideoTransformOperationId =>
  modelId === 'lucy-latest' ? 'character-swap' : 'virtual-try-on';

export const capabilityForModel = (
  modelId: VideoTransformModelId,
  capabilities: CapabilitiesResponse['videoProcessing'],
) => (modelId === 'lucy-latest' ? capabilities.characterSwap : capabilities.virtualTryOn);

export const capabilityForExistingVideoStep = (
  step: Pick<ExistingVideoStep, 'modelId' | 'provider'>,
  capabilities: CapabilitiesResponse['videoProcessing'],
): CapabilitiesResponse['videoProcessing']['virtualTryOn'] => {
  if (step.modelId !== 'lucy-latest') return capabilities.virtualTryOn;
  const selected = capabilities.characterSwap.providers?.find(
    (provider) => provider.providerId === step.provider,
  );
  return selected ? { ...selected, available: true } : capabilities.characterSwap;
};

export const stepLabel = (modelId: VideoTransformModelId): string =>
  modelId === 'lucy-latest' ? 'Character Swap' : 'Virtual Try-On';

export const defaultVideoProcessingCapabilities: CapabilitiesResponse['videoProcessing'] = {
  characterSwap: {
    available: true,
    inputPreparation: 'none',
    referencePolicy: 'optional',
    promptInput: 'editable',
    promptEnhancement: true,
    terminalFailureRelease: 'automatic',
    outputResolutions: ['720p'],
  },
  virtualTryOn: {
    available: true,
    inputPreparation: 'none',
    referencePolicy: 'optional',
    promptInput: 'editable',
    promptEnhancement: true,
    terminalFailureRelease: 'automatic',
    outputResolutions: ['720p'],
  },
};

export class RetryExistingVideoJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RetryExistingVideoJobError';
  }
}

const explicitResubmissionNotice =
  'The previous video is safe. Starting again requires a new explicit provider submission and may incur additional provider usage.';

export const terminalJobMessage = (code: string | undefined): string | null => {
  if (code === 'job_expired') {
    return `This temporary video job expired. ${explicitResubmissionNotice}`;
  }
  if (code === 'not_found') {
    return `This temporary video job is no longer available. ${explicitResubmissionNotice}`;
  }
  return null;
};

export const acceptedJobInterruptionMessage = (error: unknown, fallback: string): string => {
  if (error instanceof ApiClientError) {
    return `${error.message} Visual processing already accepted this job; resuming it does not create another submission.`;
  }
  return fallback;
};

export const submissionAcceptanceIsUnknown = (error: unknown): boolean =>
  !(error instanceof ApiClientError) || (error.status === 502 && error.code === 'invalid-response');
