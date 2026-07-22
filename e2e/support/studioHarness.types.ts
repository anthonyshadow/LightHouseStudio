import type {
  CreateReferenceImageRequest,
  EditReferenceImageRequest,
  OptimizeCharacterReferencePromptRequest,
  OptimizeCharacterReferencePromptResponse,
  ReferenceImageAsset,
} from '@studio/contracts';

export type MockReferenceImageAsset = ReferenceImageAsset;

export type ModelId = 'lucy-2.5' | 'lucy-vton-3';

export type SerializedSnapshot = {
  prompt: string;
  imageName: string | null;
  enhance: boolean;
};

export type BrowserJourneyState = {
  cameraCalls: number;
  requirementModels: ModelId[];
  connections: Array<{ model: ModelId; initial: SerializedSnapshot }>;
  applies: SerializedSnapshot[];
  disconnectCalls: number;
  recorderStarts: number;
  recorderStops: number;
  lifecycleEvents: string[];
  createdObjectUrls: string[];
  revokedObjectUrls: string[];
};

export type NetworkJourneyState = {
  apiRequests: Array<{ path: string; model: ModelId | null }>;
  referenceWorkflowCalls: Array<'optimize' | 'generate' | 'edit'>;
  referencePromptOptimizations: Array<{
    request: OptimizeCharacterReferencePromptRequest;
    response: OptimizeCharacterReferencePromptResponse;
  }>;
  referenceImageGenerations: Array<
    CreateReferenceImageRequest & { assetId: string; imagePromptSentToProvider: string }
  >;
  referenceImageEdits: Array<
    EditReferenceImageRequest & {
      sourceAssetId: string;
      assetId: string;
      imagePromptSentToProvider: string;
    }
  >;
  referenceImageMetadataReads: string[];
  referenceImageContentReads: string[];
  blockedExternalRequests: string[];
  blockedExternalWebSockets: string[];
  setCapabilityFailuresRemaining(count: number): void;
};

export type StudioHarnessOptions = {
  stubMediaPlayback?: boolean;
  referenceImagesAvailable?: boolean;
  elevenLabsAvailable?: boolean;
  realtimeProvidesVideo?: boolean;
  capabilityFailuresBeforeSuccess?: number;
};
