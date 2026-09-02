import type {
  ComposeReferenceImageRequest,
  CreateReferenceImageRequest,
  DerivedReferenceImageAsset,
  EditReferenceImageRequest,
  GeneratedReferenceImageAsset,
  OptimizeCharacterReferencePromptRequest,
  OptimizeCharacterReferencePromptResponse,
  OutfitTryOnRequest,
  UploadedReferenceImageAsset,
} from '@studio/contracts';
import type { CreativeAssetStore } from '@studio/domain';

export type MockReferenceImageAsset =
  GeneratedReferenceImageAsset | UploadedReferenceImageAsset | DerivedReferenceImageAsset;

export type ModelId = 'lucy-latest' | 'lucy-vton-latest';

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
  voiceRequests: Array<{
    kind: 'list' | 'browse' | 'save' | 'delete' | 'preview' | 'convert';
    voiceId: string | null;
    providerIntent: string | null;
    contentType: string | null;
    bodyByteSize: number;
  }>;
  referenceWorkflowCalls: Array<
    'upload' | 'optimize' | 'generate' | 'compose' | 'edit' | 'outfit-try-on'
  >;
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
  outfitTryOns: Array<OutfitTryOnRequest & { sourceAssetId: string; assetId: string }>;
  referenceImageMetadataReads: string[];
  referenceImageContentReads: string[];
  providerSdkRequests: string[];
  blockedExternalRequests: string[];
  blockedExternalWebSockets: string[];
  setCapabilityFailuresRemaining(count: number): void;
};

export type StudioHarnessOptions = {
  initiallyAuthenticated?: boolean;
  stubMediaPlayback?: boolean;
  referenceImagesAvailable?: boolean;
  wardrobeAddOutfitAvailable?: boolean;
  elevenLabsAvailable?: boolean;
  realtimeVideoAvailable?: boolean;
  realtimeBetaEnabled?: boolean;
  videoProcessingAvailable?: boolean;
  realtimeProvidesVideo?: boolean;
  capabilityFailuresBeforeSuccess?: number;
  /**
   * A configured cloud mirror and its current account copy; omitted for browser-only deployments.
   * The full snapshot envelope the real server serves — the client parses it strictly, so a
   * fabrication missing `updatedAt` would not exercise divergence, it would read as an outage.
   */
  creativeLibraryRemoteState?: {
    readonly revision: number;
    readonly store: CreativeAssetStore;
    readonly updatedAt: string;
  };
};
