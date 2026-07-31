import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import Fastify, { LogController, type FastifyInstance } from 'fastify';
import type { RuntimeConfig } from './config/environment.js';
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
import { translateVoiceServiceError } from './features/voices/error-mapper.js';
import { registerVoiceRoutes, SUPPORTED_AUDIO_CONTENT_TYPES } from './features/voices/routes.js';
import { VoiceService } from './features/voices/voice-service.js';
import { installErrorHandling } from './http/errors.js';
import { installLocalSecurityBoundary } from './http/security.js';
import {
  DecartSdkTokenProvider,
  type DecartTokenProvider,
} from './providers/decart/token-provider.js';
import {
  DecartHttpVideoJobProvider,
  type DecartVideoJobProvider,
} from './providers/decart/video-job-provider.js';
import { ElevenLabsHttpProvider } from './providers/elevenlabs/http-provider.js';
import type { ElevenLabsProvider } from './providers/elevenlabs/types.js';
import { translateProviderError } from './providers/error-mapper.js';
import { translateBflError } from './providers/bfl/error-mapper.js';
import {
  OpenAICharacterPromptOptimizer,
  type CharacterPromptOptimizer,
} from './providers/openai/character-prompt-optimizer.js';
import { translateOpenAIError } from './providers/openai/error-mapper.js';
import { translateWiroError } from './providers/wiro/error-mapper.js';
import {
  configuredReferenceImageDescriptor,
  createConfiguredReferenceImageProvider,
} from './providers/reference-images/provider-factory.js';
import { type ReferenceImageProvider } from './providers/reference-images/reference-image-provider.js';

export const OPENAI_CONNECTION_TIMEOUT_MARGIN_MS = 100_000;
export const SUPPORTED_REFERENCE_IMAGE_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export interface AppDependencies {
  readonly config: RuntimeConfig;
  readonly decartProvider?: DecartTokenProvider | null;
  readonly decartVideoProvider?: DecartVideoJobProvider | null;
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
  void app.register(multipart);

  if (dependencies.staticRoot !== undefined) {
    void app.register(fastifyStatic, {
      root: dependencies.staticRoot,
      wildcard: false,
      cacheControl: dependencies.config.nodeEnv === 'production',
      maxAge: dependencies.config.nodeEnv === 'production' ? '1h' : 0,
    });
  }

  app.addContentTypeParser(
    [...SUPPORTED_AUDIO_CONTENT_TYPES],
    { parseAs: 'buffer' },
    (_request, body, done) => done(null, body),
  );
  app.addContentTypeParser(
    [...SUPPORTED_REFERENCE_IMAGE_CONTENT_TYPES],
    { parseAs: 'buffer' },
    (_request, body, done) => done(null, body),
  );
  // Let the upload route return its image-specific 415 response for unsupported
  // image declarations instead of Fastify's generic content-parser error.
  app.addContentTypeParser(/^image\//u, { parseAs: 'buffer' }, (_request, body, done) =>
    done(null, body),
  );

  installLocalSecurityBoundary(app);

  const decartProvider = resolveOptionalProvider(dependencies.decartProvider, () =>
    dependencies.config.decartApiKey === undefined
      ? null
      : new DecartSdkTokenProvider(dependencies.config.decartApiKey),
  );
  const decartVideoProvider = resolveOptionalProvider(dependencies.decartVideoProvider, () =>
    dependencies.config.decartApiKey === undefined
      ? null
      : new DecartHttpVideoJobProvider(
          dependencies.config.decartApiKey,
          dependencies.fetchImplementation,
        ),
  );

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
        );

  const wiroAllowedForAccessMode =
    dependencies.config.referenceImageProvider !== 'wiro' ||
    dependencies.config.pilotAccessMode === 'operator-qualification';
  const configuredReferenceImageProvider = resolveOptionalProvider(
    dependencies.referenceImageProvider,
    () =>
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
  const referenceImageProvider = wiroAllowedForAccessMode ? configuredReferenceImageProvider : null;
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
    new LocalReferenceImageAssetStore(dependencies.config.lightframeDataDir);
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
    decartVideoProvider,
    dependencies.config.lightframeDataDir,
    dependencies.config.pilotAccessMode === 'participant',
  );

  registerSystemRoutes(app, {
    decartAvailable: decartProvider !== null,
    decartVideoAvailable: decartVideoProvider !== null,
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
  });
  registerRealtimeRoutes(app, decartProvider);
  registerVideoJobRoutes(app, videoJobService);
  registerReferenceImageRoutes(app, referenceImageService, {
    ...(dependencies.remoteImageDownloader
      ? { remoteImageDownloader: dependencies.remoteImageDownloader }
      : {}),
  });
  registerVoiceRoutes(app, voiceService);
  app.addHook('onClose', async () => {
    await videoJobService.close();
  });
  installErrorHandling(app, {
    serveSpa: dependencies.staticRoot !== undefined,
    translators: [
      translateReferenceImageError,
      translateVoiceServiceError,
      translateBflError,
      translateWiroError,
      translateOpenAIError,
      translateProviderError,
    ],
  });

  return app;
};
