import type {
  ComposeReferenceImageRequest,
  CreateReferenceImageRequest,
  EditReferenceImageRequest,
  GeneratedReferenceImageAsset,
  OptimizeCharacterReferencePromptRequest,
  OptimizeCharacterReferencePromptResponse,
  UploadedReferenceImageAsset,
} from '@studio/contracts';

export type MockReferenceImageAsset = GeneratedReferenceImageAsset | UploadedReferenceImageAsset;

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
  referenceWorkflowCalls: Array<'upload' | 'optimize' | 'generate' | 'compose' | 'edit'>;
  referenceImageUploads: Array<{
    requestId: string;
    assetId: string;
    byteSize: number;
    mimeType: string;
  }>;
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
  referenceImageCompositions: Array<
    ComposeReferenceImageRequest & {
      sourceAssetId: string;
      assetId: string;
      imagePromptSentToProvider: string;
    }
  >;
  referenceImageMetadataReads: string[];
  referenceImageContentReads: string[];
  providerSdkRequests: string[];
  blockedExternalRequests: string[];
  blockedExternalWebSockets: string[];
  setCapabilityFailuresRemaining(count: number): void;
};

export type StudioHarnessOptions = {
  stubMediaPlayback?: boolean;
  referenceImagesAvailable?: boolean;
  elevenLabsAvailable?: boolean;
  realtimeVideoAvailable?: boolean;
  realtimeProvidesVideo?: boolean;
  capabilityFailuresBeforeSuccess?: number;
};
