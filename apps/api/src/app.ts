import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import {
  referenceImageMimeTypeSchema,
  VIDEO_INPUT_MIME_TYPES,
  VIDEO_RESULT_MAX_BYTES,
} from '@studio/contracts';
import Fastify, { LogController, type FastifyInstance } from 'fastify';
import type { RuntimeConfig } from './config/environment.js';
import { AuthService } from './features/auth/auth-service.js';
import { registerAuthRoutes } from './features/auth/routes.js';
import { SeededUserRepository } from './features/auth/seeded-user-repository.js';
import { InMemorySessionRepository } from './features/auth/session-repository.js';
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
import {
  MAX_RECORDING_AUDIO_BYTES,
  registerVoiceRoutes,
  SUPPORTED_AUDIO_CONTENT_TYPES,
} from './features/voices/routes.js';
import { VoiceService } from './features/voices/voice-service.js';
import {
  FileSavedVoiceRepository,
  MemorySavedVoiceRepository,
} from './features/voices/saved-voice-repository.js';
import { AppError, installErrorHandling } from './http/errors.js';
import { spoolAudioUpload, SpooledUploadTooLargeError } from './application/spooled-upload.js';
import { installLocalSecurityBoundary } from './http/security.js';
import { installAuthentication } from './http/authentication.js';
import { LocalAssetByteStore } from './storage/asset-byte-store.js';
import { FileSavedVideoRepository } from './features/saved-videos/saved-video-repository.js';
import { SavedVideoService } from './features/saved-videos/saved-video-service.js';
import { registerSavedVideoRoutes } from './features/saved-videos/routes.js';
import { FileProcessingJobRepository } from './features/processing-jobs/file-processing-job-repository.js';
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
export const SUPPORTED_REFERENCE_IMAGE_CONTENT_TYPES = referenceImageMimeTypeSchema.options;

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
  readonly fetchImplementation?: typeof fetch;
  readonly logger?: boolean;
  readonly staticRoot?: string;
}

const resolveOptionalProvider = <Provider>(
  provided: Provider | null | undefined,
  createProvider: () => Provider | null,
): Provider | null => (provided === undefined ? createProvider() : provided);

export const createApp = (dependencies: AppDependencies): FastifyInstance => {
  const app = Fastify({
    logger: dependencies.logger ?? dependencies.config.nodeEnv !== 'test',
    // Default Fastify request logs include the full query string. Voice searches and
    // provider ids are ephemeral user data, so this local broker never logs request URLs.
    logController: new LogController({ disableRequestLogging: true }),
    bodyLimit: 1024 * 1024,
    requestTimeout: 100_000,
    // Node's socket timeout also covers the quiet interval while a handler waits
    // for OpenAI. It must outlive both provider timeouts plus image validation and
    // atomic storage, otherwise the client loses the structured error response while
    // upstream work may still be settling.
    connectionTimeout:
      Math.max(
        dependencies.config.referenceImageTimeoutMs,
        dependencies.config.openAiPromptOptimizerTimeoutMs,
      ) + OPENAI_CONNECTION_TIMEOUT_MARGIN_MS,
    keepAliveTimeout: 5_000,
    trustProxy: false,
  });

  void app.register(helmet, {
    // Provider WebSocket/media destinations vary by account and SDK release. A CSP
    // should be added only once those production origins are deployment-configured.
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  });
  void app.register(cookie);
  void app.register(multipart);

  if (dependencies.staticRoot !== undefined) {
    void app.register(fastifyStatic, {
      root: dependencies.staticRoot,
      wildcard: false,
      cacheControl: dependencies.config.nodeEnv === 'production',
      maxAge: dependencies.config.nodeEnv === 'production' ? '1h' : 0,
    });
  }

  app.addContentTypeParser([...SUPPORTED_AUDIO_CONTENT_TYPES], (_request, payload, done) => {
    void spoolAudioUpload(payload, MAX_RECORDING_AUDIO_BYTES).then(
      (body) => done(null, body),
      (error: unknown) =>
        done(
          error instanceof SpooledUploadTooLargeError
            ? new AppError(413, 'payload_too_large', 'The audio sidecar must be 25 MiB or smaller.')
            : (error as Error),
        ),
    );
  });
  app.addContentTypeParser(
    [...SUPPORTED_REFERENCE_IMAGE_CONTENT_TYPES],
    { parseAs: 'buffer' },
    (_request, body, done) => done(null, body),
  );
  app.addContentTypeParser([...VIDEO_INPUT_MIME_TYPES], (_request, payload, done) => {
    void spoolAudioUpload(payload, VIDEO_RESULT_MAX_BYTES).then(
      (body) => done(null, body),
      (error: unknown) =>
        done(
          error instanceof SpooledUploadTooLargeError
            ? new AppError(413, 'payload_too_large', 'The saved video must be 300 MB or smaller.')
            : (error as Error),
        ),
    );
  });
  // Let the upload route return its image-specific 415 response for unsupported
  // image declarations instead of Fastify's generic content-parser error.
  app.addContentTypeParser(/^image\//u, { parseAs: 'buffer' }, (_request, body, done) =>
    done(null, body),
  );

  installLocalSecurityBoundary(app);

  const authService = new AuthService(
    new SeededUserRepository({
      id: dependencies.config.demoUserId,
      login: dependencies.config.demoUserLogin,
      displayName: dependencies.config.demoUserDisplayName,
      passwordHash: dependencies.config.demoUserPasswordHash,
    }),
    new InMemorySessionRepository(),
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
          dependencies.config.nodeEnv === 'test'
            ? new MemorySavedVoiceRepository()
            : new FileSavedVoiceRepository(dependencies.config.lightframeDataDir),
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
  const videoJobService = new VideoJobService(
    videoJobProviders,
    dependencies.config.lightframeDataDir,
    {
      ...(dependencies.config.nodeEnv === 'test'
        ? {}
        : {
            traceWriter: new FileProcessingJobRepository(dependencies.config.lightframeDataDir),
          }),
      providerIds: {
        'character-swap': dependencies.config.existingVideoCharacterSwapProvider,
        'virtual-try-on': 'decart',
      },
    },
  );
  const savedVideoService = new SavedVideoService(
    new FileSavedVideoRepository(dependencies.config.lightframeDataDir),
    new LocalAssetByteStore(dependencies.config.lightframeDataDir),
  );

  registerAuthRoutes(app, authService, dependencies.config);
  registerSystemRoutes(app, {
    decartAvailable: decartProvider !== null,
    videoProcessing: {
      characterSwap: videoJobProviders['character-swap'],
      virtualTryOn: videoJobProviders['virtual-try-on'],
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
  });
  registerRealtimeRoutes(app, decartProvider);
  registerVideoJobRoutes(app, videoJobService);
  registerSavedVideoRoutes(app, savedVideoService);
  registerReferenceImageRoutes(app, referenceImageService, {
    ...(dependencies.remoteImageDownloader
      ? { remoteImageDownloader: dependencies.remoteImageDownloader }
      : {}),
    outfitTryOnService,
  });
  registerVoiceRoutes(app, voiceService);
  app.addHook('onClose', async () => {
    await videoJobService.close();
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
