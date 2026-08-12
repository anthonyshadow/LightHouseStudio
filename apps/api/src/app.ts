import type { RuntimeConfig } from './config/environment.js';
import { ApplicationRuntime } from './application/application-runtime.js';
import { AuthService } from './features/auth/auth-service.js';
import { registerAuthRoutes } from './features/auth/routes.js';
import {
  SeededUserRepository,
  type UserRepository,
} from './features/auth/seeded-user-repository.js';
import {
  InMemorySessionRepository,
  type SessionRepository,
} from './features/auth/session-repository.js';
import { registerRealtimeRoutes } from './features/realtime/routes.js';
import { registerSystemRoutes } from './features/system/routes.js';
import { registerVideoJobRoutes } from './features/video-jobs/routes.js';
import { VideoJobService } from './features/video-jobs/video-job-service.js';
import {
  LocalReferenceImageAssetStore,
  type ReferenceImageAssetStore,
} from './features/reference-images/asset-store.js';
import { translateReferenceImageError } from './features/reference-images/error-mapper.js';
import {
  registerReferenceImageRoutes,
  type RemoteReferenceImageDownloader,
} from './features/reference-images/routes.js';
import { ReferenceImageService } from './features/reference-images/reference-image-service.js';
import { OutfitTryOnService } from './features/reference-images/outfit-try-on-service.js';
import { translateVoiceServiceError } from './features/voices/error-mapper.js';
import { registerVoiceRoutes } from './features/voices/routes.js';
import { VoiceService } from './features/voices/voice-service.js';
import {
  FileSavedVoiceRepository,
  MemorySavedVoiceRepository,
  type SavedVoiceRepository,
} from './features/voices/saved-voice-repository.js';
import { installErrorHandling } from './http/errors.js';
import { installLocalSecurityBoundary } from './http/security.js';
import { installAuthentication } from './http/authentication.js';
import { LocalAssetByteStore, type AssetByteStore } from './storage/asset-byte-store.js';
import {
  FileSavedVideoRepository,
  type SavedVideoRepository,
} from './features/saved-videos/saved-video-repository.js';
import { SavedVideoService } from './features/saved-videos/saved-video-service.js';
import { registerSavedVideoRoutes } from './features/saved-videos/routes.js';
import { DirectSavedVideoUploadService } from './features/saved-videos/direct-upload-service.js';
import { registerCreativeLibraryRoutes } from './features/creative-libraries/routes.js';
import type { CreativeLibraryRepository } from './features/creative-libraries/creative-library-repository.js';
import type { DirectUploadRepository } from './storage/direct-upload.js';
import type {
  ProjectOutputMetadataUnitOfWork,
  ProjectRepository,
  ProjectRetentionPolicy,
} from './features/projects/project-repository.js';
import type { R2AssetByteStore } from './storage/r2-asset-byte-store.js';
import {
  type DurableProcessingJobRepository,
  FileProcessingJobRepository,
  type ProcessingJobTraceWriter,
} from './features/processing-jobs/file-processing-job-repository.js';
import {
  DecartSdkTokenProvider,
  type DecartTokenProvider,
} from './providers/decart/token-provider.js';
import { ElevenLabsHttpProvider } from './providers/elevenlabs/http-provider.js';
import type { ElevenLabsProvider } from './providers/elevenlabs/types.js';
import { translateProviderError } from './providers/error-mapper.js';
import { translateBflError } from './providers/bfl/error-mapper.js';
import {
  OpenAICharacterPromptOptimizer,
  type CharacterPromptOptimizer,
} from './providers/openai/character-prompt-optimizer.js';
import { translateOpenAIError } from './providers/openai/error-mapper.js';
import { translatePrunaImageTryOnError } from './providers/pruna/image-try-on-error-mapper.js';
import { translateWiroError } from './providers/wiro/error-mapper.js';
import type { ProviderFetch } from './providers/transport/provider-fetch.js';
import {
  configuredReferenceImageDescriptor,
  createConfiguredReferenceImageProvider,
} from './providers/reference-images/provider-factory.js';
import { type ReferenceImageProvider } from './providers/reference-images/reference-image-provider.js';
import type { ExistingVideoJobProvider } from './providers/video-jobs/video-job-provider.js';
import { createExistingVideoProviderRegistry } from './providers/video-jobs/provider-factory.js';
import {
  PrunaImageTryOnProvider,
  type OutfitTryOnProvider,
} from './providers/pruna/image-try-on-provider.js';

export const OPENAI_CONNECTION_TIMEOUT_MARGIN_MS = 100_000;

export interface AppPersistenceDependencies {
  readonly users?: UserRepository;
  readonly sessions?: SessionRepository;
  readonly savedVideos?: SavedVideoRepository;
  readonly assetBytes?: AssetByteStore;
  readonly savedVoices?: SavedVoiceRepository;
  readonly referenceImages?: ReferenceImageAssetStore;
  readonly processingJobTraces?: ProcessingJobTraceWriter;
  readonly processingJobs?: DurableProcessingJobRepository;
  readonly projects?: ProjectRepository;
  readonly projectOutputMetadata?: ProjectOutputMetadataUnitOfWork;
  readonly projectRetention?: ProjectRetentionPolicy;
  readonly creativeLibraries?: CreativeLibraryRepository;
  readonly directVideoUploads?: {
    readonly repository: DirectUploadRepository;
    readonly storage: R2AssetByteStore;
  };
  readonly close?: () => Promise<void>;
}

export interface AppDependencies {
  readonly config: RuntimeConfig;
  readonly decartProvider?: DecartTokenProvider | null;
  readonly decartVideoProvider?: ExistingVideoJobProvider | null;
  readonly prunaVideoProvider?: ExistingVideoJobProvider | null;
  readonly prunaImageTryOnProvider?: OutfitTryOnProvider | null;
  readonly elevenLabsProvider?: ElevenLabsProvider | null;
  readonly referenceImageProvider?: ReferenceImageProvider | null;
  readonly characterPromptOptimizer?: CharacterPromptOptimizer | null;
  readonly referenceImageAssetStore?: ReferenceImageAssetStore;
  readonly remoteImageDownloader?: RemoteReferenceImageDownloader;
  readonly persistence?: AppPersistenceDependencies;
  readonly fetchImplementation?: ProviderFetch;
  readonly logger?: boolean;
  readonly staticRoot?: string;
}

const resolveOptionalProvider = <Provider>(
  provided: Provider | null | undefined,
  createProvider: () => Provider | null,
): Provider | null => (provided === undefined ? createProvider() : provided);

export const createApp = (dependencies: AppDependencies): ApplicationRuntime => {
  const app = new ApplicationRuntime({
    logger: dependencies.logger ?? dependencies.config.nodeEnv !== 'test',
    hostname: dependencies.config.host,
    port: dependencies.config.port,
    requestTimeoutMs: 100_000,
    // The application-owned post-parse inactivity watchdog must outlive both
    // provider timeouts plus image validation and atomic storage. Bun's per-request
    // idle timer is disabled only after the separately bounded receive phase.
    connectionTimeoutMs:
      Math.max(
        dependencies.config.referenceImageTimeoutMs,
        dependencies.config.openAiPromptOptimizerTimeoutMs,
      ) + OPENAI_CONNECTION_TIMEOUT_MARGIN_MS,
    ...(dependencies.config.telemetryEnabled &&
    dependencies.config.otelExporterEndpoint !== undefined
      ? {
          telemetry: {
            exporterEndpoint: dependencies.config.otelExporterEndpoint,
            sampleRatio: dependencies.config.otelTraceSampleRatio,
            serviceName: 'lightframe-api',
          },
        }
      : {}),
    ...(dependencies.staticRoot === undefined ? {} : { staticRoot: dependencies.staticRoot }),
  });

  installLocalSecurityBoundary(app);

  const authService = new AuthService(
    dependencies.persistence?.users ??
      new SeededUserRepository({
        id: dependencies.config.demoUserId,
        login: dependencies.config.demoUserLogin,
        displayName: dependencies.config.demoUserDisplayName,
        passwordHash: dependencies.config.demoUserPasswordHash,
      }),
    dependencies.persistence?.sessions ?? new InMemorySessionRepository(),
    dependencies.config.authJwtSecret,
    'lightframe-studio',
    'lightframe-local-api',
    dependencies.config.authSessionTtlSeconds,
    dependencies.config.demoUserPasswordHash,
  );
  installAuthentication(app, authService, dependencies.config);

  const decartProvider = resolveOptionalProvider(dependencies.decartProvider, () =>
    dependencies.config.decartApiKey === undefined
      ? null
      : new DecartSdkTokenProvider(dependencies.config.decartApiKey),
  );
  const videoJobProviders = createExistingVideoProviderRegistry(dependencies.config, {
    ...(dependencies.fetchImplementation === undefined
      ? {}
      : { fetchImplementation: dependencies.fetchImplementation }),
    ...(dependencies.decartVideoProvider === undefined
      ? {}
      : { decartProvider: dependencies.decartVideoProvider }),
    ...(dependencies.prunaVideoProvider === undefined
      ? {}
      : { prunaProvider: dependencies.prunaVideoProvider }),
  });

  const elevenLabsProvider = resolveOptionalProvider(dependencies.elevenLabsProvider, () =>
    dependencies.config.elevenLabsApiKey === undefined
      ? null
      : new ElevenLabsHttpProvider(
          dependencies.config.elevenLabsApiKey,
          dependencies.fetchImplementation,
          dependencies.config.providerTimeoutMs,
        ),
  );

  const voiceService =
    elevenLabsProvider === null
      ? null
      : new VoiceService(
          elevenLabsProvider,
          dependencies.config.elevenLabsModelId,
          dependencies.config.elevenLabsEnableLogging,
          dependencies.persistence?.savedVoices ??
            (dependencies.config.nodeEnv === 'test'
              ? new MemorySavedVoiceRepository()
              : new FileSavedVoiceRepository(dependencies.config.lightframeDataDir)),
        );

  const referenceImageProvider = resolveOptionalProvider(dependencies.referenceImageProvider, () =>
    createConfiguredReferenceImageProvider(dependencies.config, {
      ...(dependencies.fetchImplementation === undefined
        ? {}
        : { fetchImplementation: dependencies.fetchImplementation }),
      observeBflLifecycle: (event) => {
        app.log.info(event, 'BFL reference image lifecycle');
      },
      observeWiroLifecycle: (event) => {
        if (event.stage === 'cleanup_failed') {
          app.log.warn(event, 'Wiro remote artifact cleanup failed');
          return;
        }
        app.log.info(event, 'Wiro reference image lifecycle');
      },
    }),
  );
  const characterPromptOptimizer = resolveOptionalProvider(
    dependencies.characterPromptOptimizer,
    () =>
      dependencies.config.openAiApiKey === undefined
        ? null
        : new OpenAICharacterPromptOptimizer(dependencies.config.openAiApiKey, {
            model: dependencies.config.openAiPromptOptimizerModel,
            reasoning: dependencies.config.openAiPromptOptimizerReasoning,
            version: dependencies.config.openAiPromptOptimizerVersion,
            timeoutMs: dependencies.config.openAiPromptOptimizerTimeoutMs,
          }),
  );
  const referenceImageAssetStore =
    dependencies.referenceImageAssetStore ??
    dependencies.persistence?.referenceImages ??
    new LocalReferenceImageAssetStore(dependencies.config.lightframeDataDir, {
      legacyOwnerUserId: dependencies.config.demoUserId,
    });
  const outfitTryOnProvider = resolveOptionalProvider(dependencies.prunaImageTryOnProvider, () =>
    dependencies.config.prunaImageTryOnEnabled && dependencies.config.prunaApiKey
      ? new PrunaImageTryOnProvider(dependencies.config.prunaApiKey, {
          ...(dependencies.fetchImplementation === undefined
            ? {}
            : { fetchImplementation: dependencies.fetchImplementation }),
        })
      : null,
  );
  const outfitTryOnService = new OutfitTryOnService(outfitTryOnProvider, referenceImageAssetStore);
  const configuredReferenceImage = configuredReferenceImageDescriptor(dependencies.config);
  const referenceImageService = new ReferenceImageService(
    referenceImageProvider,
    referenceImageAssetStore,
    {
      optimizer: characterPromptOptimizer,
      providerDescriptor: configuredReferenceImage,
      imageModel: configuredReferenceImage.modelId,
      imageQuality: dependencies.config.openAiReferenceImageQuality,
      optimizerVersion: dependencies.config.openAiPromptOptimizerVersion,
    },
  );
  const processingJobTraceWriter =
    dependencies.persistence?.processingJobTraces ??
    (dependencies.config.nodeEnv === 'test'
      ? undefined
      : new FileProcessingJobRepository(dependencies.config.lightframeDataDir));
  const videoJobService = new VideoJobService(
    videoJobProviders,
    dependencies.config.lightframeDataDir,
    {
      ...(processingJobTraceWriter === undefined ? {} : { traceWriter: processingJobTraceWriter }),
      ...(dependencies.persistence?.processingJobs === undefined
        ? {}
        : { durableJobRepository: dependencies.persistence.processingJobs }),
      maximumActiveJobs: dependencies.config.videoJobMaxActive,
      maximumActiveJobsPerProvider: dependencies.config.videoJobMaxActivePerProvider,
    },
  );
  const savedVideoService = new SavedVideoService(
    dependencies.persistence?.savedVideos ??
      new FileSavedVideoRepository(dependencies.config.lightframeDataDir),
    dependencies.persistence?.assetBytes ??
      new LocalAssetByteStore(dependencies.config.lightframeDataDir),
    {
      deleteStoredAssetsOnManualDelete: dependencies.config.assetStoreProvider === 'r2',
      ...(dependencies.persistence?.projectRetention === undefined
        ? {}
        : { projectRetention: dependencies.persistence.projectRetention }),
    },
  );
  const directSavedVideoUploads = dependencies.persistence?.directVideoUploads;
  const directSavedVideoUploadService =
    directSavedVideoUploads === undefined
      ? undefined
      : new DirectSavedVideoUploadService(
          directSavedVideoUploads.repository,
          directSavedVideoUploads.storage,
          savedVideoService,
        );

  registerAuthRoutes(app, authService, dependencies.config);
  registerSystemRoutes(app, {
    decartAvailable: decartProvider !== null,
    videoProcessing: {
      characterSwap: videoJobProviders.characterSwap,
      defaultCharacterSwapProvider: videoJobProviders.defaultCharacterSwapProvider,
      virtualTryOn: videoJobProviders.virtualTryOn,
    },
    elevenLabsAvailable: elevenLabsProvider !== null,
    elevenLabsModelId: dependencies.config.elevenLabsModelId,
    referenceImagesAvailable: referenceImageService.generationAvailable,
    referenceImageEditAvailable: referenceImageService.editAvailable,
    referenceImageProviderId: configuredReferenceImage.providerId,
    referenceImageModelId: configuredReferenceImage.modelId,
    referenceImageQuality: dependencies.config.openAiReferenceImageQuality,
    promptOptimizerAvailable: referenceImageService.optimizationAvailable,
    promptOptimizerModel: dependencies.config.openAiPromptOptimizerModel,
    promptOptimizerVersion: dependencies.config.openAiPromptOptimizerVersion,
    wardrobeAddOutfitAvailable: outfitTryOnService.available,
    directSavedVideoUploadAvailable: directSavedVideoUploadService !== undefined,
  });
  registerRealtimeRoutes(app, decartProvider);
  registerVideoJobRoutes(app, videoJobService);
  registerSavedVideoRoutes(app, savedVideoService, directSavedVideoUploadService);
  registerCreativeLibraryRoutes(
    app,
    dependencies.persistence?.creativeLibraries,
    referenceImageAssetStore,
  );
  registerReferenceImageRoutes(app, referenceImageService, {
    ...(dependencies.remoteImageDownloader
      ? { remoteImageDownloader: dependencies.remoteImageDownloader }
      : {}),
    outfitTryOnService,
  });
  registerVoiceRoutes(app, voiceService);
  app.addHook('onClose', async () => {
    await directSavedVideoUploadService?.close();
    await videoJobService.close();
    await dependencies.persistence?.close?.();
  });
  installErrorHandling(app, {
    serveSpa: dependencies.staticRoot !== undefined,
    translators: [
      translateReferenceImageError,
      translatePrunaImageTryOnError,
      translateVoiceServiceError,
      translateBflError,
      translateWiroError,
      translateOpenAIError,
      translateProviderError,
    ],
  });

  return app;
};
