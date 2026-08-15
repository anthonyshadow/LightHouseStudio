import path from 'node:path';
import { z } from 'zod';
import {
  CHARACTER_PROMPT_OPTIMIZER_DEFAULT_MODEL,
  CHARACTER_PROMPT_OPTIMIZER_DEFAULT_REASONING,
  CHARACTER_PROMPT_OPTIMIZER_DEFAULT_VERSION,
  REFERENCE_IMAGE_MODEL_ID,
  REFERENCE_IMAGE_QUALITY,
  PRUNA_IMAGE_TRY_ON_MODEL,
} from '@studio/contracts';

export const DEFAULT_API_PORT = 4100;
export const DEFAULT_ELEVENLABS_STS_MODEL_ID = 'eleven_multilingual_sts_v2';
export const DEFAULT_LIGHTFRAME_DATA_DIR = './.lightframe-data';
export const DEFAULT_REFERENCE_IMAGE_TIMEOUT_MS = 150_000;
export const DEFAULT_WIRO_REFERENCE_IMAGE_TIMEOUT_MS = 180_000;
export const DEFAULT_PROMPT_OPTIMIZER_TIMEOUT_MS = 120_000;
export const MAX_PROMPT_OPTIMIZER_TIMEOUT_MS = 180_000;
export const BFL_REFERENCE_IMAGE_MODEL = 'flux-2-pro' as const;
export const WIRO_REFERENCE_IMAGE_MODEL = 'seedream-v5-lite-uncensored' as const;
export const PRUNA_VIDEO_REPLACE_MODEL = 'p-video-replace' as const;
export const DEFAULT_BFL_SAFETY_TOLERANCE = 2;
export const DEFAULT_BFL_DISABLE_PROMPT_UPSAMPLING = true;
export const DEFAULT_DEMO_USER_ID = '2d7914b2-f912-4b96-b17d-54100a2ffea3';
export const DEFAULT_DEMO_USER_LOGIN = 'demo@lightframe.local';
export const DEFAULT_DEMO_USER_DISPLAY_NAME = 'Demo Creator';
export const DEFAULT_DEMO_USER_PASSWORD = 'lightframe-demo';
export const DEFAULT_DEMO_USER_PASSWORD_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$AQ6KYL1hKyx+ajWTKCCdCA$wrv4SBSsWdptAwMQE3QHId1riBhXxJ/10dvv0Kh/HK8';
export const DEFAULT_DEMO_JWT_SECRET = 'lightframe-local-demo-signing-key-not-for-production-2026';
export const DEFAULT_AUTH_SESSION_TTL_SECONDS = 24 * 60 * 60;
export const DEFAULT_AUTH_COOKIE_NAME = 'lightframe_session';
export const DEFAULT_VIDEO_JOB_MAX_ACTIVE = 8;
export const DEFAULT_VIDEO_JOB_MAX_ACTIVE_PER_PROVIDER = 4;
export const DEVELOPMENT_R2_BUCKET = 'lightframe-studio-development';

export const databaseUrlUsesEncryptedTransport = (value: string): boolean => {
  const sslMode = new URL(value).searchParams.get('sslmode');
  return sslMode === 'require' || sslMode === 'verify-ca' || sslMode === 'verify-full';
};

const normalizeOptionalString = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
};

const optionalSecretSchema = z.preprocess(
  normalizeOptionalString,
  z.string().trim().min(1).optional(),
);

const optionalModelSchema = z.preprocess(
  normalizeOptionalString,
  z.string().trim().min(1).max(128).optional(),
);

const portSchema = z.preprocess(
  (value) => (value === undefined || value === '' ? DEFAULT_API_PORT : value),
  z.coerce.number().int().min(1).max(65_535),
);

const timeoutSchema = (defaultValue: number) =>
  z.preprocess(
    (value) => (value === undefined || value === '' ? defaultValue : value),
    z.coerce.number().int().min(10_000).max(MAX_PROMPT_OPTIMIZER_TIMEOUT_MS),
  );

const strictBooleanSchema = (defaultValue: boolean) =>
  z.preprocess((value) => {
    if (value === undefined || value === '') return defaultValue;
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  }, z.boolean());

const positiveLimitSchema = (defaultValue: number) =>
  z.preprocess(
    (value) => (value === undefined || value === '' ? defaultValue : value),
    z.coerce.number().int().min(1).max(100),
  );

const samplingRatioSchema = z.preprocess(
  (value) => (value === undefined || value === '' ? 0.1 : value),
  z.coerce.number().min(0).max(1),
);

const environmentSchema = z
  .object({
    LIGHTFRAME_ENV: z.enum(['development', 'production']).optional(),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: portSchema,
    DEMO_AUTH_ENABLED: strictBooleanSchema(true),
    DEMO_AUTH_PREFILL: strictBooleanSchema(true),
    DEMO_USER_ID: z.preprocess(normalizeOptionalString, z.uuid().default(DEFAULT_DEMO_USER_ID)),
    DEMO_USER_LOGIN: z.preprocess(
      normalizeOptionalString,
      z.string().trim().min(1).max(254).default(DEFAULT_DEMO_USER_LOGIN),
    ),
    DEMO_USER_DISPLAY_NAME: z.preprocess(
      normalizeOptionalString,
      z.string().trim().min(1).max(100).default(DEFAULT_DEMO_USER_DISPLAY_NAME),
    ),
    DEMO_USER_PASSWORD: z.preprocess(
      normalizeOptionalString,
      z.string().min(1).max(512).default(DEFAULT_DEMO_USER_PASSWORD),
    ),
    DEMO_USER_PASSWORD_HASH: z.preprocess(
      normalizeOptionalString,
      z.string().startsWith('$argon2id$').default(DEFAULT_DEMO_USER_PASSWORD_HASH),
    ),
    AUTH_JWT_SECRET: z.preprocess(
      normalizeOptionalString,
      z.string().min(32).default(DEFAULT_DEMO_JWT_SECRET),
    ),
    AUTH_SESSION_TTL_SECONDS: z.preprocess(
      (value) => (value === undefined || value === '' ? DEFAULT_AUTH_SESSION_TTL_SECONDS : value),
      z.coerce
        .number()
        .int()
        .min(300)
        .max(7 * 24 * 60 * 60),
    ),
    AUTH_COOKIE_NAME: z.preprocess(
      normalizeOptionalString,
      z
        .string()
        .regex(/^[A-Za-z0-9_-]+$/u)
        .default(DEFAULT_AUTH_COOKIE_NAME),
    ),
    AUTH_COOKIE_SECURE: strictBooleanSchema(false),
    DATABASE_MODE: z.preprocess(
      normalizeOptionalString,
      z.enum(['local', 'shadow', 'postgres', 'neon']).default('local'),
    ),
    DATABASE_URL: z.preprocess(
      normalizeOptionalString,
      z
        .string()
        .url()
        .regex(/^postgres(?:ql)?:\/\//u)
        .optional(),
    ),
    ASSET_STORE_PROVIDER: z.preprocess(
      normalizeOptionalString,
      z.enum(['local', 'r2']).default('local'),
    ),
    R2_ACCOUNT_ID: z.preprocess(
      normalizeOptionalString,
      z
        .string()
        .regex(/^[a-f0-9]{32}$/u)
        .optional(),
    ),
    R2_ACCESS_KEY_ID: optionalSecretSchema,
    R2_SECRET_ACCESS_KEY: optionalSecretSchema,
    R2_BUCKET: z.preprocess(
      normalizeOptionalString,
      z
        .string()
        .regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/u)
        .optional(),
    ),
    R2_KEY_PREFIX: z.preprocess(
      normalizeOptionalString,
      z
        .string()
        .regex(/^[a-z0-9][a-z0-9/_-]{0,127}$/u)
        .default('media/v1'),
    ),
    OTEL_TRACING_ENABLED: strictBooleanSchema(false),
    OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: z.preprocess(
      normalizeOptionalString,
      z
        .string()
        .url()
        .regex(/^https?:\/\//u)
        .optional(),
    ),
    OTEL_TRACE_SAMPLE_RATIO: samplingRatioSchema,
    VIDEO_JOB_MAX_ACTIVE: positiveLimitSchema(DEFAULT_VIDEO_JOB_MAX_ACTIVE),
    VIDEO_JOB_MAX_ACTIVE_PER_PROVIDER: positiveLimitSchema(
      DEFAULT_VIDEO_JOB_MAX_ACTIVE_PER_PROVIDER,
    ),
    REALTIME_VIDEO_BETA_ENABLED: strictBooleanSchema(false),
    DECART_API_KEY: optionalSecretSchema,
    EXISTING_VIDEO_CHARACTER_SWAP_PROVIDER: z.preprocess(
      normalizeOptionalString,
      z.enum(['decart', 'pruna']).default('decart'),
    ),
    PRUNA_VIDEO_REPLACE_ENABLED: strictBooleanSchema(false),
    PRUNA_API_KEY: optionalSecretSchema,
    PRUNA_VIDEO_REPLACE_MODEL: z.preprocess(
      normalizeOptionalString,
      z.literal(PRUNA_VIDEO_REPLACE_MODEL).optional(),
    ),
    PRUNA_IMAGE_TRY_ON_ENABLED: strictBooleanSchema(false),
    PRUNA_IMAGE_TRY_ON_MODEL: z.preprocess(
      normalizeOptionalString,
      z.literal(PRUNA_IMAGE_TRY_ON_MODEL).optional(),
    ),
    OPENAI_API_KEY: optionalSecretSchema,
    OPENAI_PROMPT_OPTIMIZER_MODEL: optionalModelSchema,
    OPENAI_PROMPT_OPTIMIZER_REASONING: z.preprocess(
      normalizeOptionalString,
      z.enum(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']).optional(),
    ),
    OPENAI_PROMPT_OPTIMIZER_VERSION: optionalModelSchema,
    OPENAI_PROMPT_OPTIMIZER_TIMEOUT_MS: timeoutSchema(DEFAULT_PROMPT_OPTIMIZER_TIMEOUT_MS),
    OPENAI_REFERENCE_IMAGE_MODEL: optionalModelSchema,
    OPENAI_REFERENCE_IMAGE_QUALITY: z.preprocess(
      normalizeOptionalString,
      z.enum(['high', 'medium']).optional(),
    ),
    REFERENCE_IMAGE_PROVIDER: z.preprocess(
      normalizeOptionalString,
      z.enum(['openai', 'bfl', 'wiro']).default('openai'),
    ),
    BFL_API_KEY: optionalSecretSchema,
    BFL_REFERENCE_IMAGE_MODEL: z.preprocess(
      normalizeOptionalString,
      z.literal(BFL_REFERENCE_IMAGE_MODEL).default(BFL_REFERENCE_IMAGE_MODEL),
    ),
    BFL_SAFETY_TOLERANCE: z.preprocess(
      (value) => (value === undefined || value === '' ? DEFAULT_BFL_SAFETY_TOLERANCE : value),
      z.coerce.number().int().min(0).max(5),
    ),
    BFL_DISABLE_PROMPT_UPSAMPLING: strictBooleanSchema(DEFAULT_BFL_DISABLE_PROMPT_UPSAMPLING),
    BFL_REFERENCE_IMAGE_TIMEOUT_MS: timeoutSchema(DEFAULT_REFERENCE_IMAGE_TIMEOUT_MS),
    WIRO_API_KEY: optionalSecretSchema,
    WIRO_API_SECRET: optionalSecretSchema,
    WIRO_REFERENCE_IMAGE_MODEL: z.preprocess(
      normalizeOptionalString,
      z.literal(WIRO_REFERENCE_IMAGE_MODEL).default(WIRO_REFERENCE_IMAGE_MODEL),
    ),
    WIRO_REFERENCE_IMAGE_TIMEOUT_MS: timeoutSchema(DEFAULT_WIRO_REFERENCE_IMAGE_TIMEOUT_MS),
    ELEVENLABS_API_KEY: optionalSecretSchema,
    ELEVENLABS_STS_MODEL_ID: optionalModelSchema,
    ELEVENLABS_ENABLE_LOGGING: strictBooleanSchema(false),
    LIGHTFRAME_DATA_DIR: z.preprocess(
      (value) => (value === undefined || value === '' ? DEFAULT_LIGHTFRAME_DATA_DIR : value),
      z.string().trim().min(1),
    ),
  })
  .superRefine((value, context) => {
    const required: ReadonlyArray<readonly [keyof typeof value, boolean, string]> = [
      ...(value.EXISTING_VIDEO_CHARACTER_SWAP_PROVIDER === 'pruna'
        ? ([
            [
              'PRUNA_VIDEO_REPLACE_ENABLED',
              value.PRUNA_VIDEO_REPLACE_ENABLED,
              'Set PRUNA_VIDEO_REPLACE_ENABLED=true to use Pruna as the default Character Swap provider.',
            ],
          ] as const)
        : []),
      ...(value.PRUNA_VIDEO_REPLACE_ENABLED
        ? ([
            ['PRUNA_API_KEY', value.PRUNA_API_KEY !== undefined, 'Set PRUNA_API_KEY.'],
            [
              'PRUNA_VIDEO_REPLACE_MODEL',
              value.PRUNA_VIDEO_REPLACE_MODEL !== undefined,
              `Set PRUNA_VIDEO_REPLACE_MODEL=${PRUNA_VIDEO_REPLACE_MODEL}.`,
            ],
          ] as const)
        : []),
      ...(value.PRUNA_IMAGE_TRY_ON_ENABLED
        ? ([
            ['PRUNA_API_KEY', value.PRUNA_API_KEY !== undefined, 'Set PRUNA_API_KEY.'],
            [
              'PRUNA_IMAGE_TRY_ON_MODEL',
              value.PRUNA_IMAGE_TRY_ON_MODEL !== undefined,
              `Set PRUNA_IMAGE_TRY_ON_MODEL=${PRUNA_IMAGE_TRY_ON_MODEL}.`,
            ],
          ] as const)
        : []),
    ];
    for (const [variable, valid, message] of required) {
      if (!valid) context.addIssue({ code: 'custom', path: [variable], message });
    }
    if (value.DATABASE_MODE !== 'local' && value.DATABASE_URL === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['DATABASE_URL'],
        message: 'Set DATABASE_URL when DATABASE_MODE uses relational persistence.',
      });
    }
    if (
      value.DATABASE_MODE === 'neon' &&
      value.DATABASE_URL !== undefined &&
      !databaseUrlUsesEncryptedTransport(value.DATABASE_URL)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['DATABASE_URL'],
        message:
          'Neon DATABASE_URL must explicitly require encrypted transport with sslmode=require or stronger.',
      });
    }
    if (value.ASSET_STORE_PROVIDER === 'r2') {
      if (value.DATABASE_MODE === 'local') {
        context.addIssue({
          code: 'custom',
          path: ['DATABASE_MODE'],
          message: 'Use DATABASE_MODE=shadow, postgres, or neon when ASSET_STORE_PROVIDER=r2.',
        });
      }
      for (const [variable, valid] of [
        ['R2_ACCOUNT_ID', value.R2_ACCOUNT_ID !== undefined],
        ['R2_ACCESS_KEY_ID', value.R2_ACCESS_KEY_ID !== undefined],
        ['R2_SECRET_ACCESS_KEY', value.R2_SECRET_ACCESS_KEY !== undefined],
        ['R2_BUCKET', value.R2_BUCKET !== undefined],
      ] as const) {
        if (!valid) {
          context.addIssue({
            code: 'custom',
            path: [variable],
            message: `Set ${variable} when ASSET_STORE_PROVIDER=r2.`,
          });
        }
      }
    }
    if (value.VIDEO_JOB_MAX_ACTIVE_PER_PROVIDER > value.VIDEO_JOB_MAX_ACTIVE) {
      context.addIssue({
        code: 'custom',
        path: ['VIDEO_JOB_MAX_ACTIVE_PER_PROVIDER'],
        message: 'VIDEO_JOB_MAX_ACTIVE_PER_PROVIDER cannot exceed VIDEO_JOB_MAX_ACTIVE.',
      });
    }
    if (value.OTEL_TRACING_ENABLED && value.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['OTEL_EXPORTER_OTLP_TRACES_ENDPOINT'],
        message: 'Set OTEL_EXPORTER_OTLP_TRACES_ENDPOINT when tracing is enabled.',
      });
    }
    if (value.LIGHTFRAME_ENV === 'development') {
      if (value.NODE_ENV !== 'development') {
        context.addIssue({
          code: 'custom',
          path: ['NODE_ENV'],
          message: 'Use NODE_ENV=development with LIGHTFRAME_ENV=development.',
        });
      }
      if (value.DATABASE_MODE !== 'postgres') {
        context.addIssue({
          code: 'custom',
          path: ['DATABASE_MODE'],
          message: 'Development requires DATABASE_MODE=postgres.',
        });
      }
      if (value.DATABASE_URL !== undefined) {
        const hostname = new URL(value.DATABASE_URL).hostname;
        if (hostname !== '127.0.0.1' && hostname !== 'localhost' && hostname !== '[::1]') {
          context.addIssue({
            code: 'custom',
            path: ['DATABASE_URL'],
            message: 'Development DATABASE_URL must use a loopback PostgreSQL host.',
          });
        }
      }
      if (value.ASSET_STORE_PROVIDER !== 'r2') {
        context.addIssue({
          code: 'custom',
          path: ['ASSET_STORE_PROVIDER'],
          message: 'Development requires the isolated private R2 asset store.',
        });
      }
      if (value.R2_BUCKET !== undefined && value.R2_BUCKET !== DEVELOPMENT_R2_BUCKET) {
        context.addIssue({
          code: 'custom',
          path: ['R2_BUCKET'],
          message: `Development requires R2_BUCKET=${DEVELOPMENT_R2_BUCKET}.`,
        });
      }
    }
    if (value.LIGHTFRAME_ENV === 'production') {
      if (value.NODE_ENV !== 'production') {
        context.addIssue({
          code: 'custom',
          path: ['NODE_ENV'],
          message: 'Use NODE_ENV=production with LIGHTFRAME_ENV=production.',
        });
      }
      if (value.DATABASE_MODE !== 'neon') {
        context.addIssue({
          code: 'custom',
          path: ['DATABASE_MODE'],
          message: 'Production requires DATABASE_MODE=neon.',
        });
      }
      if (value.DATABASE_URL !== undefined) {
        const hostname = new URL(value.DATABASE_URL).hostname;
        if (hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '[::1]') {
          context.addIssue({
            code: 'custom',
            path: ['DATABASE_URL'],
            message: 'Production DATABASE_URL must not use a loopback PostgreSQL host.',
          });
        }
      }
      if (value.ASSET_STORE_PROVIDER !== 'r2') {
        context.addIssue({
          code: 'custom',
          path: ['ASSET_STORE_PROVIDER'],
          message: 'Production requires the private R2 asset store.',
        });
      }
    }
    if (value.NODE_ENV === 'production' && value.AUTH_JWT_SECRET === DEFAULT_DEMO_JWT_SECRET) {
      context.addIssue({
        code: 'custom',
        path: ['AUTH_JWT_SECRET'],
        message: 'Set an environment-specific signing secret in production.',
      });
    }
    if (
      value.NODE_ENV === 'production' &&
      value.DEMO_AUTH_ENABLED &&
      value.DEMO_USER_PASSWORD_HASH === DEFAULT_DEMO_USER_PASSWORD_HASH
    ) {
      context.addIssue({
        code: 'custom',
        path: ['DEMO_USER_PASSWORD_HASH'],
        message: 'Set an environment-specific demo password hash in production.',
      });
    }
  });

export interface RuntimeConfig {
  readonly nodeEnv: 'development' | 'test' | 'production';
  readonly host: '127.0.0.1';
  readonly port: number;
  readonly demoAuthEnabled: boolean;
  readonly demoAuthPrefill: boolean;
  readonly demoUserId: string;
  readonly demoUserLogin: string;
  readonly demoUserDisplayName: string;
  readonly demoUserPassword: string;
  readonly demoUserPasswordHash: string;
  readonly authJwtSecret: string;
  readonly authSessionTtlSeconds: number;
  readonly authCookieName: string;
  readonly authCookieSecure: boolean;
  readonly databaseMode: 'local' | 'shadow' | 'postgres' | 'neon';
  readonly databaseUrl?: string;
  readonly assetStoreProvider: 'local' | 'r2';
  readonly r2AccountId?: string;
  readonly r2AccessKeyId?: string;
  readonly r2SecretAccessKey?: string;
  readonly r2Bucket?: string;
  readonly r2KeyPrefix: string;
  readonly telemetryEnabled: boolean;
  readonly otelExporterEndpoint?: string;
  readonly otelTraceSampleRatio: number;
  readonly videoJobMaxActive: number;
  readonly videoJobMaxActivePerProvider: number;
  readonly realtimeVideoBetaEnabled: boolean;
  readonly decartApiKey?: string;
  readonly existingVideoCharacterSwapProvider: 'decart' | 'pruna';
  readonly prunaVideoReplaceEnabled: boolean;
  readonly prunaApiKey?: string;
  readonly prunaVideoReplaceModel?: typeof PRUNA_VIDEO_REPLACE_MODEL;
  readonly prunaImageTryOnEnabled: boolean;
  readonly prunaImageTryOnModel?: typeof PRUNA_IMAGE_TRY_ON_MODEL;
  readonly openAiApiKey?: string;
  readonly openAiPromptOptimizerModel: string;
  readonly openAiPromptOptimizerReasoning:
    'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  readonly openAiPromptOptimizerVersion: string;
  readonly openAiPromptOptimizerTimeoutMs: number;
  readonly openAiReferenceImageModel: string;
  readonly openAiReferenceImageQuality: 'high' | 'medium';
  readonly referenceImageProvider: 'openai' | 'bfl' | 'wiro';
  readonly bflApiKey?: string;
  readonly bflReferenceImageModel: typeof BFL_REFERENCE_IMAGE_MODEL;
  readonly bflSafetyTolerance: number;
  readonly bflDisablePromptUpsampling: boolean;
  readonly bflReferenceImageTimeoutMs: number;
  readonly wiroApiKey?: string;
  readonly wiroApiSecret?: string;
  readonly wiroReferenceImageModel: typeof WIRO_REFERENCE_IMAGE_MODEL;
  readonly wiroReferenceImageTimeoutMs: number;
  readonly elevenLabsApiKey?: string;
  readonly elevenLabsModelId: string;
  readonly elevenLabsEnableLogging: boolean;
  readonly providerTimeoutMs: number;
  readonly referenceImageTimeoutMs: number;
  readonly lightframeDataDir: string;
}

export class EnvironmentValidationError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`Invalid server environment: ${issues.join('; ')}`);
    this.name = 'EnvironmentValidationError';
    this.issues = issues;
  }
}

export interface ResolvedLightframeDataDirectory {
  readonly path: string;
  readonly usesLegacyApiRelativePath: boolean;
}

export class MissingProductionWebDistributionError extends Error {
  constructor() {
    super('The production web distribution is missing. Run the production build first.');
    this.name = 'MissingProductionWebDistributionError';
  }
}

export const resolveStaticRoot = (
  nodeEnv: RuntimeConfig['nodeEnv'],
  candidate: string,
  pathExists: (path: string) => boolean,
): string | undefined => {
  if (pathExists(candidate)) return candidate;
  if (nodeEnv === 'production') throw new MissingProductionWebDistributionError();
  return undefined;
};

export const resolveLightframeDataDirectory = (
  configuredPath: string,
  options: {
    readonly repositoryRoot: string;
    readonly apiRoot: string;
    readonly pathExists: (candidate: string) => boolean;
  },
): ResolvedLightframeDataDirectory => {
  if (path.isAbsolute(configuredPath)) {
    return { path: path.resolve(configuredPath), usesLegacyApiRelativePath: false };
  }

  const canonicalPath = path.resolve(options.repositoryRoot, configuredPath);
  const legacyPath = path.resolve(options.apiRoot, configuredPath);
  if (!options.pathExists(canonicalPath) && options.pathExists(legacyPath)) {
    return { path: legacyPath, usesLegacyApiRelativePath: true };
  }
  return { path: canonicalPath, usesLegacyApiRelativePath: false };
};

const referenceImageTimeout = (
  provider: RuntimeConfig['referenceImageProvider'],
  bflTimeoutMs: number,
  wiroTimeoutMs: number,
): number => {
  switch (provider) {
    case 'bfl':
      return bflTimeoutMs;
    case 'wiro':
      return wiroTimeoutMs;
    case 'openai':
      return DEFAULT_REFERENCE_IMAGE_TIMEOUT_MS;
  }
};

export const parseEnvironment = (
  environment: Readonly<Record<string, string | undefined>>,
): RuntimeConfig => {
  const result = environmentSchema.safeParse(environment);

  if (!result.success) {
    throw new EnvironmentValidationError(
      result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }

  return {
    nodeEnv: result.data.NODE_ENV,
    host: '127.0.0.1',
    port: result.data.PORT,
    demoAuthEnabled: result.data.DEMO_AUTH_ENABLED,
    demoAuthPrefill: result.data.DEMO_AUTH_PREFILL,
    demoUserId: result.data.DEMO_USER_ID,
    demoUserLogin: result.data.DEMO_USER_LOGIN,
    demoUserDisplayName: result.data.DEMO_USER_DISPLAY_NAME,
    demoUserPassword: result.data.DEMO_USER_PASSWORD,
    demoUserPasswordHash: result.data.DEMO_USER_PASSWORD_HASH,
    authJwtSecret: result.data.AUTH_JWT_SECRET,
    authSessionTtlSeconds: result.data.AUTH_SESSION_TTL_SECONDS,
    authCookieName: result.data.AUTH_COOKIE_NAME,
    authCookieSecure: result.data.AUTH_COOKIE_SECURE,
    databaseMode: result.data.DATABASE_MODE,
    ...(result.data.DATABASE_URL === undefined ? {} : { databaseUrl: result.data.DATABASE_URL }),
    assetStoreProvider: result.data.ASSET_STORE_PROVIDER,
    ...(result.data.R2_ACCOUNT_ID === undefined ? {} : { r2AccountId: result.data.R2_ACCOUNT_ID }),
    ...(result.data.R2_ACCESS_KEY_ID === undefined
      ? {}
      : { r2AccessKeyId: result.data.R2_ACCESS_KEY_ID }),
    ...(result.data.R2_SECRET_ACCESS_KEY === undefined
      ? {}
      : { r2SecretAccessKey: result.data.R2_SECRET_ACCESS_KEY }),
    ...(result.data.R2_BUCKET === undefined ? {} : { r2Bucket: result.data.R2_BUCKET }),
    r2KeyPrefix: result.data.R2_KEY_PREFIX,
    telemetryEnabled: result.data.OTEL_TRACING_ENABLED,
    ...(result.data.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT === undefined
      ? {}
      : { otelExporterEndpoint: result.data.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT }),
    otelTraceSampleRatio: result.data.OTEL_TRACE_SAMPLE_RATIO,
    videoJobMaxActive: result.data.VIDEO_JOB_MAX_ACTIVE,
    videoJobMaxActivePerProvider: result.data.VIDEO_JOB_MAX_ACTIVE_PER_PROVIDER,
    realtimeVideoBetaEnabled: result.data.REALTIME_VIDEO_BETA_ENABLED,
    ...(result.data.DECART_API_KEY === undefined
      ? {}
      : { decartApiKey: result.data.DECART_API_KEY }),
    existingVideoCharacterSwapProvider: result.data.EXISTING_VIDEO_CHARACTER_SWAP_PROVIDER,
    prunaVideoReplaceEnabled: result.data.PRUNA_VIDEO_REPLACE_ENABLED,
    ...(result.data.PRUNA_API_KEY === undefined ? {} : { prunaApiKey: result.data.PRUNA_API_KEY }),
    ...(result.data.PRUNA_VIDEO_REPLACE_MODEL === undefined
      ? {}
      : { prunaVideoReplaceModel: result.data.PRUNA_VIDEO_REPLACE_MODEL }),
    prunaImageTryOnEnabled: result.data.PRUNA_IMAGE_TRY_ON_ENABLED,
    ...(result.data.PRUNA_IMAGE_TRY_ON_MODEL === undefined
      ? {}
      : { prunaImageTryOnModel: result.data.PRUNA_IMAGE_TRY_ON_MODEL }),
    ...(result.data.OPENAI_API_KEY === undefined
      ? {}
      : { openAiApiKey: result.data.OPENAI_API_KEY }),
    openAiPromptOptimizerModel:
      result.data.OPENAI_PROMPT_OPTIMIZER_MODEL ?? CHARACTER_PROMPT_OPTIMIZER_DEFAULT_MODEL,
    openAiPromptOptimizerReasoning:
      result.data.OPENAI_PROMPT_OPTIMIZER_REASONING ?? CHARACTER_PROMPT_OPTIMIZER_DEFAULT_REASONING,
    openAiPromptOptimizerVersion:
      result.data.OPENAI_PROMPT_OPTIMIZER_VERSION ?? CHARACTER_PROMPT_OPTIMIZER_DEFAULT_VERSION,
    openAiPromptOptimizerTimeoutMs: result.data.OPENAI_PROMPT_OPTIMIZER_TIMEOUT_MS,
    openAiReferenceImageModel: result.data.OPENAI_REFERENCE_IMAGE_MODEL ?? REFERENCE_IMAGE_MODEL_ID,
    openAiReferenceImageQuality:
      result.data.OPENAI_REFERENCE_IMAGE_QUALITY ?? REFERENCE_IMAGE_QUALITY,
    referenceImageProvider: result.data.REFERENCE_IMAGE_PROVIDER,
    ...(result.data.BFL_API_KEY === undefined ? {} : { bflApiKey: result.data.BFL_API_KEY }),
    bflReferenceImageModel: result.data.BFL_REFERENCE_IMAGE_MODEL,
    bflSafetyTolerance: result.data.BFL_SAFETY_TOLERANCE,
    bflDisablePromptUpsampling: result.data.BFL_DISABLE_PROMPT_UPSAMPLING,
    bflReferenceImageTimeoutMs: result.data.BFL_REFERENCE_IMAGE_TIMEOUT_MS,
    ...(result.data.WIRO_API_KEY === undefined ? {} : { wiroApiKey: result.data.WIRO_API_KEY }),
    ...(result.data.WIRO_API_SECRET === undefined
      ? {}
      : { wiroApiSecret: result.data.WIRO_API_SECRET }),
    wiroReferenceImageModel: result.data.WIRO_REFERENCE_IMAGE_MODEL,
    wiroReferenceImageTimeoutMs: result.data.WIRO_REFERENCE_IMAGE_TIMEOUT_MS,
    ...(result.data.ELEVENLABS_API_KEY === undefined
      ? {}
      : { elevenLabsApiKey: result.data.ELEVENLABS_API_KEY }),
    elevenLabsModelId: result.data.ELEVENLABS_STS_MODEL_ID ?? DEFAULT_ELEVENLABS_STS_MODEL_ID,
    elevenLabsEnableLogging: result.data.ELEVENLABS_ENABLE_LOGGING,
    providerTimeoutMs: 30_000,
    referenceImageTimeoutMs: referenceImageTimeout(
      result.data.REFERENCE_IMAGE_PROVIDER,
      result.data.BFL_REFERENCE_IMAGE_TIMEOUT_MS,
      result.data.WIRO_REFERENCE_IMAGE_TIMEOUT_MS,
    ),
    lightframeDataDir: result.data.LIGHTFRAME_DATA_DIR,
  };
};
