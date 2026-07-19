import helmet from '@fastify/helmet';
import fastifyStatic from '@fastify/static';
import Fastify, { LogController, type FastifyInstance } from 'fastify';
import type { RuntimeConfig } from './config/environment.js';
import { registerRealtimeRoutes } from './features/realtime/routes.js';
import { registerSystemRoutes } from './features/system/routes.js';
import {
  LocalReferenceImageAssetStore,
  type ReferenceImageAssetStore,
} from './features/reference-images/asset-store.js';
import { registerReferenceImageRoutes } from './features/reference-images/routes.js';
import { ReferenceImageService } from './features/reference-images/reference-image-service.js';
import { registerVoiceRoutes, SUPPORTED_AUDIO_CONTENT_TYPES } from './features/voices/routes.js';
import { VoiceService } from './features/voices/voice-service.js';
import { installErrorHandling } from './http/errors.js';
import { installLocalSecurityBoundary } from './http/security.js';
import {
  DecartSdkTokenProvider,
  type DecartTokenProvider,
} from './providers/decart/token-provider.js';
import { ElevenLabsHttpProvider } from './providers/elevenlabs/http-provider.js';
import type { ElevenLabsProvider } from './providers/elevenlabs/types.js';
import {
  OpenAIReferenceImageProvider,
  type ReferenceImageProvider,
} from './providers/openai/reference-image-provider.js';

export const REFERENCE_IMAGE_CONNECTION_TIMEOUT_MARGIN_MS = 30_000;

export interface AppDependencies {
  readonly config: RuntimeConfig;
  readonly decartProvider?: DecartTokenProvider | null;
  readonly elevenLabsProvider?: ElevenLabsProvider | null;
  readonly referenceImageProvider?: ReferenceImageProvider | null;
  readonly referenceImageAssetStore?: ReferenceImageAssetStore;
  readonly fetchImplementation?: typeof fetch;
  readonly logger?: boolean;
  readonly staticRoot?: string;
}

export const createApp = (dependencies: AppDependencies): FastifyInstance => {
  const app = Fastify({
    logger: dependencies.logger ?? dependencies.config.nodeEnv !== 'test',
    // Default Fastify request logs include the full query string. Voice searches and
    // provider ids are ephemeral user data, so this local broker never logs request URLs.
    logController: new LogController({ disableRequestLogging: true }),
    bodyLimit: 1024 * 1024,
    requestTimeout: 30_000,
    // Node's socket timeout also covers the quiet interval while a handler waits
    // for OpenAI. It must outlive the provider timeout plus image validation and
    // atomic storage, otherwise the client sees a 502 while the billable job keeps running.
    connectionTimeout:
      dependencies.config.referenceImageTimeoutMs + REFERENCE_IMAGE_CONNECTION_TIMEOUT_MARGIN_MS,
    keepAliveTimeout: 5_000,
    trustProxy: false,
  });

  void app.register(helmet, {
    // Provider WebSocket/media destinations vary by account and SDK release. A CSP
    // should be added only once those production origins are deployment-configured.
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  });

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

  installLocalSecurityBoundary(app);

  const decartProvider =
    dependencies.decartProvider !== undefined
      ? dependencies.decartProvider
      : dependencies.config.decartApiKey === undefined
        ? null
        : new DecartSdkTokenProvider(dependencies.config.decartApiKey);

  const elevenLabsProvider =
    dependencies.elevenLabsProvider !== undefined
      ? dependencies.elevenLabsProvider
      : dependencies.config.elevenLabsApiKey === undefined
        ? null
        : new ElevenLabsHttpProvider(
            dependencies.config.elevenLabsApiKey,
            dependencies.fetchImplementation,
            dependencies.config.providerTimeoutMs,
          );

  const voiceService =
    elevenLabsProvider === null
      ? null
      : new VoiceService(
          elevenLabsProvider,
          dependencies.config.elevenLabsModelId,
          dependencies.config.elevenLabsEnableLogging,
        );

  const referenceImageProvider =
    dependencies.referenceImageProvider !== undefined
      ? dependencies.referenceImageProvider
      : dependencies.config.openAiApiKey === undefined
        ? null
        : new OpenAIReferenceImageProvider(
            dependencies.config.openAiApiKey,
            dependencies.config.referenceImageTimeoutMs,
          );
  const referenceImageAssetStore =
    dependencies.referenceImageAssetStore ??
    new LocalReferenceImageAssetStore(dependencies.config.lightframeDataDir);
  const referenceImageService = new ReferenceImageService(
    referenceImageProvider,
    referenceImageAssetStore,
  );

  registerSystemRoutes(app, {
    decartAvailable: decartProvider !== null,
    elevenLabsAvailable: elevenLabsProvider !== null,
    elevenLabsModelId: dependencies.config.elevenLabsModelId,
    referenceImagesAvailable: referenceImageService.generationAvailable,
  });
  registerRealtimeRoutes(app, decartProvider);
  registerReferenceImageRoutes(app, referenceImageService);
  registerVoiceRoutes(app, voiceService);
  installErrorHandling(app, { serveSpa: dependencies.staticRoot !== undefined });

  return app;
};
