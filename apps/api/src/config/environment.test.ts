import { describe, expect, it } from 'vitest';
import {
  DEFAULT_API_PORT,
  DEFAULT_ELEVENLABS_STS_MODEL_ID,
  DEFAULT_LIGHTFRAME_DATA_DIR,
  DEFAULT_PROMPT_OPTIMIZER_TIMEOUT_MS,
  DEFAULT_REFERENCE_IMAGE_TIMEOUT_MS,
  DEFAULT_VIDEO_JOB_MAX_ACTIVE,
  DEFAULT_VIDEO_JOB_MAX_ACTIVE_PER_PROVIDER,
  DEFAULT_WIRO_REFERENCE_IMAGE_TIMEOUT_MS,
  DEVELOPMENT_R2_BUCKET,
  EnvironmentValidationError,
  parseEnvironment,
  resolveLightframeDataDirectory,
  resolveStaticRoot,
} from './environment.js';

describe('parseEnvironment', () => {
  it('uses safe local defaults without requiring provider credentials', () => {
    expect(parseEnvironment({})).toMatchObject({
      nodeEnv: 'development',
      host: '127.0.0.1',
      port: DEFAULT_API_PORT,
      databaseMode: 'local',
      assetStoreProvider: 'local',
      r2KeyPrefix: 'media/v1',
      videoJobMaxActive: DEFAULT_VIDEO_JOB_MAX_ACTIVE,
      videoJobMaxActivePerProvider: DEFAULT_VIDEO_JOB_MAX_ACTIVE_PER_PROVIDER,
      existingVideoCharacterSwapProvider: 'decart',
      prunaVideoReplaceEnabled: false,
      prunaImageTryOnEnabled: false,
      elevenLabsModelId: DEFAULT_ELEVENLABS_STS_MODEL_ID,
      elevenLabsEnableLogging: false,
      lightframeDataDir: DEFAULT_LIGHTFRAME_DATA_DIR,
      telemetryEnabled: false,
      otelTraceSampleRatio: 0.1,
      referenceImageTimeoutMs: DEFAULT_REFERENCE_IMAGE_TIMEOUT_MS,
      openAiPromptOptimizerModel: 'gpt-5.6',
      openAiPromptOptimizerReasoning: 'medium',
      openAiPromptOptimizerVersion: 'character-reference-v2',
      openAiPromptOptimizerTimeoutMs: DEFAULT_PROMPT_OPTIMIZER_TIMEOUT_MS,
      openAiReferenceImageModel: 'gpt-image-2',
      openAiReferenceImageQuality: 'high',
      referenceImageProvider: 'openai',
      bflReferenceImageModel: 'flux-2-pro',
      bflSafetyTolerance: 2,
      bflDisablePromptUpsampling: true,
      bflReferenceImageTimeoutMs: DEFAULT_REFERENCE_IMAGE_TIMEOUT_MS,
      wiroReferenceImageModel: 'seedream-v5-lite-uncensored',
      wiroReferenceImageTimeoutMs: DEFAULT_WIRO_REFERENCE_IMAGE_TIMEOUT_MS,
    });
  });

  it('enables tracing only with an explicit OTLP endpoint and sampling ratio', () => {
    expect(
      parseEnvironment({
        OTEL_TRACING_ENABLED: 'true',
        OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: ' https://otel.example.test/v1/traces ',
        OTEL_TRACE_SAMPLE_RATIO: '0.25',
      }),
    ).toMatchObject({
      telemetryEnabled: true,
      otelExporterEndpoint: 'https://otel.example.test/v1/traces',
      otelTraceSampleRatio: 0.25,
    });
    expect(() => parseEnvironment({ OTEL_TRACING_ENABLED: 'true' })).toThrow(
      'OTEL_EXPORTER_OTLP_TRACES_ENDPOINT',
    );
    expect(() => parseEnvironment({ OTEL_TRACE_SAMPLE_RATIO: '1.01' })).toThrow(
      EnvironmentValidationError,
    );
  });

  it('accepts an explicit Neon and private R2 configuration', () => {
    expect(
      parseEnvironment({
        DATABASE_MODE: 'neon',
        DATABASE_URL: 'postgresql://user:password@example.neon.tech/lightframe?sslmode=require',
        ASSET_STORE_PROVIDER: 'r2',
        R2_ACCOUNT_ID: '0123456789abcdef0123456789abcdef',
        R2_ACCESS_KEY_ID: ' r2-access ',
        R2_SECRET_ACCESS_KEY: ' r2-secret ',
        R2_BUCKET: 'lightframe-private',
        R2_KEY_PREFIX: 'media/staging/v1',
        VIDEO_JOB_MAX_ACTIVE: '12',
        VIDEO_JOB_MAX_ACTIVE_PER_PROVIDER: '5',
      }),
    ).toMatchObject({
      databaseMode: 'neon',
      databaseUrl: 'postgresql://user:password@example.neon.tech/lightframe?sslmode=require',
      assetStoreProvider: 'r2',
      r2AccountId: '0123456789abcdef0123456789abcdef',
      r2AccessKeyId: 'r2-access',
      r2SecretAccessKey: 'r2-secret',
      r2Bucket: 'lightframe-private',
      r2KeyPrefix: 'media/staging/v1',
      videoJobMaxActive: 12,
      videoJobMaxActivePerProvider: 5,
    });
  });

  it('accepts the isolated development PostgreSQL and R2 profile', () => {
    expect(
      parseEnvironment({
        LIGHTFRAME_ENV: 'development',
        NODE_ENV: 'development',
        DATABASE_MODE: 'postgres',
        DATABASE_URL: 'postgresql://lightframe:local@127.0.0.1:5433/lightframe_development',
        ASSET_STORE_PROVIDER: 'r2',
        R2_ACCOUNT_ID: '0123456789abcdef0123456789abcdef',
        R2_ACCESS_KEY_ID: 'development-access',
        R2_SECRET_ACCESS_KEY: 'development-secret',
        R2_BUCKET: DEVELOPMENT_R2_BUCKET,
      }),
    ).toMatchObject({
      nodeEnv: 'development',
      databaseMode: 'postgres',
      r2Bucket: DEVELOPMENT_R2_BUCKET,
    });
  });

  it.each([
    [
      {
        LIGHTFRAME_ENV: 'development',
        NODE_ENV: 'development',
        DATABASE_MODE: 'postgres',
        DATABASE_URL: 'postgresql://user:password@example.neon.tech/lightframe',
        ASSET_STORE_PROVIDER: 'r2',
        R2_ACCOUNT_ID: '0123456789abcdef0123456789abcdef',
        R2_ACCESS_KEY_ID: 'development-access',
        R2_SECRET_ACCESS_KEY: 'development-secret',
        R2_BUCKET: DEVELOPMENT_R2_BUCKET,
      },
      'loopback',
    ],
    [
      {
        LIGHTFRAME_ENV: 'development',
        NODE_ENV: 'development',
        DATABASE_MODE: 'postgres',
        DATABASE_URL: 'postgresql://lightframe:local@127.0.0.1:5433/lightframe_development',
        ASSET_STORE_PROVIDER: 'r2',
        R2_ACCOUNT_ID: '0123456789abcdef0123456789abcdef',
        R2_ACCESS_KEY_ID: 'development-access',
        R2_SECRET_ACCESS_KEY: 'development-secret',
        R2_BUCKET: 'production-media',
      },
      DEVELOPMENT_R2_BUCKET,
    ],
    [
      {
        LIGHTFRAME_ENV: 'production',
        NODE_ENV: 'production',
        DATABASE_MODE: 'postgres',
        DATABASE_URL: 'postgresql://lightframe:local@127.0.0.1:5433/lightframe_development',
        ASSET_STORE_PROVIDER: 'r2',
        R2_ACCOUNT_ID: '0123456789abcdef0123456789abcdef',
        R2_ACCESS_KEY_ID: 'production-access',
        R2_SECRET_ACCESS_KEY: 'production-secret',
        R2_BUCKET: 'production-media',
        AUTH_JWT_SECRET: 'production-test-signing-secret-that-is-not-a-default',
        DEMO_USER_PASSWORD_HASH:
          '$argon2id$v=19$m=19456,t=2,p=1$3Jc1DI4gFLxlnIHlbUmVvg$HvHo3eFp60xDrSTIRQaDaLilJgFBNQ6fJ4xwlL+I+iA',
      },
      'DATABASE_MODE=neon',
    ],
  ] as const)('rejects cross-environment persistence configuration %#', (environment, message) => {
    expect(() => parseEnvironment(environment)).toThrow(message);
  });

  it('blocks production while the default demo password hash is still configured', () => {
    expect(() =>
      parseEnvironment({
        LIGHTFRAME_ENV: 'production',
        NODE_ENV: 'production',
        DATABASE_MODE: 'neon',
        DATABASE_URL: 'postgresql://user:password@example.neon.tech/lightframe',
        ASSET_STORE_PROVIDER: 'r2',
        R2_ACCOUNT_ID: '0123456789abcdef0123456789abcdef',
        R2_ACCESS_KEY_ID: 'production-access',
        R2_SECRET_ACCESS_KEY: 'production-secret',
        R2_BUCKET: 'production-media',
        AUTH_JWT_SECRET: 'production-test-signing-secret-that-is-not-a-default',
      }),
    ).toThrow('DEMO_USER_PASSWORD_HASH');
  });

  it.each([
    [{ DATABASE_MODE: 'neon' }, 'DATABASE_URL'],
    [{ DATABASE_MODE: 'automatic' }, 'DATABASE_MODE'],
    [{ ASSET_STORE_PROVIDER: 'r2' }, 'DATABASE_MODE'],
    [
      {
        DATABASE_MODE: 'neon',
        DATABASE_URL: 'postgresql://user:password@example.neon.tech/lightframe',
        ASSET_STORE_PROVIDER: 'r2',
      },
      'R2_ACCOUNT_ID',
    ],
  ] as const)('rejects incomplete cloud persistence configuration %#', (environment, variable) => {
    expect(() => parseEnvironment(environment)).toThrow(variable);
  });

  it('trims configured values and parses strict booleans', () => {
    expect(
      parseEnvironment({
        NODE_ENV: 'production',
        AUTH_JWT_SECRET: 'production-test-signing-secret-that-is-not-a-default',
        DEMO_USER_PASSWORD_HASH:
          '$argon2id$v=19$m=19456,t=2,p=1$3Jc1DI4gFLxlnIHlbUmVvg$HvHo3eFp60xDrSTIRQaDaLilJgFBNQ6fJ4xwlL+I+iA',
        PORT: '4321',
        DECART_API_KEY: '  decart-placeholder  ',
        OPENAI_API_KEY: '  openai-placeholder  ',
        OPENAI_PROMPT_OPTIMIZER_MODEL: ' gpt-test-optimizer ',
        OPENAI_PROMPT_OPTIMIZER_REASONING: ' high ',
        OPENAI_PROMPT_OPTIMIZER_VERSION: ' optimizer-v2 ',
        OPENAI_PROMPT_OPTIMIZER_TIMEOUT_MS: '95000',
        OPENAI_REFERENCE_IMAGE_MODEL: ' gpt-image-test ',
        OPENAI_REFERENCE_IMAGE_QUALITY: ' medium ',
        REFERENCE_IMAGE_PROVIDER: ' bfl ',
        BFL_API_KEY: ' bfl-placeholder ',
        BFL_REFERENCE_IMAGE_MODEL: ' flux-2-pro ',
        BFL_SAFETY_TOLERANCE: '3',
        BFL_DISABLE_PROMPT_UPSAMPLING: 'false',
        BFL_REFERENCE_IMAGE_TIMEOUT_MS: '140000',
        WIRO_API_KEY: ' wiro-key-placeholder ',
        WIRO_API_SECRET: ' wiro-secret-placeholder ',
        WIRO_REFERENCE_IMAGE_MODEL: ' seedream-v5-lite-uncensored ',
        WIRO_REFERENCE_IMAGE_TIMEOUT_MS: '170000',
        ELEVENLABS_API_KEY: '  eleven-placeholder  ',
        ELEVENLABS_STS_MODEL_ID: ' custom-sts ',
        ELEVENLABS_ENABLE_LOGGING: 'false',
        LIGHTFRAME_DATA_DIR: '  /tmp/lightframe-test  ',
      }),
    ).toMatchObject({
      nodeEnv: 'production',
      port: 4321,
      decartApiKey: 'decart-placeholder',
      openAiApiKey: 'openai-placeholder',
      openAiPromptOptimizerModel: 'gpt-test-optimizer',
      openAiPromptOptimizerReasoning: 'high',
      openAiPromptOptimizerVersion: 'optimizer-v2',
      openAiPromptOptimizerTimeoutMs: 95_000,
      openAiReferenceImageModel: 'gpt-image-test',
      openAiReferenceImageQuality: 'medium',
      referenceImageProvider: 'bfl',
      bflApiKey: 'bfl-placeholder',
      bflReferenceImageModel: 'flux-2-pro',
      bflSafetyTolerance: 3,
      bflDisablePromptUpsampling: false,
      bflReferenceImageTimeoutMs: 140_000,
      wiroApiKey: 'wiro-key-placeholder',
      wiroApiSecret: 'wiro-secret-placeholder',
      wiroReferenceImageModel: 'seedream-v5-lite-uncensored',
      wiroReferenceImageTimeoutMs: 170_000,
      referenceImageTimeoutMs: 140_000,
      elevenLabsApiKey: 'eleven-placeholder',
      elevenLabsModelId: 'custom-sts',
      elevenLabsEnableLogging: false,
      lightframeDataDir: '/tmp/lightframe-test',
    });
  });

  it('accepts an explicit Decart Character Swap selection without Pruna initialization values', () => {
    expect(parseEnvironment({ EXISTING_VIDEO_CHARACTER_SWAP_PROVIDER: 'decart' })).toMatchObject({
      existingVideoCharacterSwapProvider: 'decart',
      prunaVideoReplaceEnabled: false,
    });
  });

  it('rejects the complete invalid environment boundary', () => {
    for (const environment of [
      { PORT: '0' },
      { PORT: 'not-a-number' },
      { NODE_ENV: 'staging' },
      { ELEVENLABS_ENABLE_LOGGING: 'FALSE' },
      { OPENAI_PROMPT_OPTIMIZER_REASONING: 'extreme' },
      { OPENAI_PROMPT_OPTIMIZER_TIMEOUT_MS: '9999' },
      { OPENAI_PROMPT_OPTIMIZER_TIMEOUT_MS: '180001' },
      { OPENAI_REFERENCE_IMAGE_QUALITY: 'low' },
      { REFERENCE_IMAGE_PROVIDER: 'automatic' },
      { BFL_REFERENCE_IMAGE_MODEL: 'flux-2-pro-preview' },
      { BFL_SAFETY_TOLERANCE: '6' },
      { BFL_DISABLE_PROMPT_UPSAMPLING: 'TRUE' },
      { BFL_REFERENCE_IMAGE_TIMEOUT_MS: '9999' },
      { BFL_REFERENCE_IMAGE_TIMEOUT_MS: '180001' },
      { WIRO_REFERENCE_IMAGE_MODEL: 'seedream-v5-lite' },
      { WIRO_REFERENCE_IMAGE_TIMEOUT_MS: '9999' },
      { WIRO_REFERENCE_IMAGE_TIMEOUT_MS: '180001' },
      { EXISTING_VIDEO_CHARACTER_SWAP_PROVIDER: 'automatic' },
      { PRUNA_VIDEO_REPLACE_ENABLED: 'TRUE' },
      { PRUNA_VIDEO_REPLACE_MODEL: 'p-video-replace-latest' },
      { PRUNA_IMAGE_TRY_ON_ENABLED: 'TRUE' },
      { PRUNA_IMAGE_TRY_ON_MODEL: 'p-image-try-on-latest' },
      { VIDEO_JOB_MAX_ACTIVE: '0' },
      { VIDEO_JOB_MAX_ACTIVE_PER_PROVIDER: '101' },
      { VIDEO_JOB_MAX_ACTIVE: '2', VIDEO_JOB_MAX_ACTIVE_PER_PROVIDER: '3' },
    ]) {
      expect(() => parseEnvironment(environment), JSON.stringify(environment)).toThrow(
        EnvironmentValidationError,
      );
    }
  });

  it('accepts explicit Pruna Character Swap without a server-pinned output resolution', () => {
    expect(
      parseEnvironment({
        EXISTING_VIDEO_CHARACTER_SWAP_PROVIDER: 'pruna',
        PRUNA_VIDEO_REPLACE_ENABLED: 'true',
        PRUNA_API_KEY: ' pruna-secret ',
        PRUNA_VIDEO_REPLACE_MODEL: ' p-video-replace ',
      }),
    ).toMatchObject({
      existingVideoCharacterSwapProvider: 'pruna',
      prunaVideoReplaceEnabled: true,
      prunaApiKey: 'pruna-secret',
      prunaVideoReplaceModel: 'p-video-replace',
    });
  });

  it.each([
    ['PRUNA_VIDEO_REPLACE_ENABLED', { PRUNA_VIDEO_REPLACE_ENABLED: 'false' }],
    ['PRUNA_API_KEY', { PRUNA_API_KEY: '' }],
    ['PRUNA_VIDEO_REPLACE_MODEL', { PRUNA_VIDEO_REPLACE_MODEL: '' }],
  ] as const)('names missing Pruna requirement %s when selected', (variable, override) => {
    expect(() =>
      parseEnvironment({
        EXISTING_VIDEO_CHARACTER_SWAP_PROVIDER: 'pruna',
        PRUNA_VIDEO_REPLACE_ENABLED: 'true',
        PRUNA_API_KEY: 'pruna-secret',
        PRUNA_VIDEO_REPLACE_MODEL: 'p-video-replace',
        ...override,
      }),
    ).toThrow(variable);
  });

  it('requires the complete Pruna binding whenever its Character Swap option is enabled', () => {
    expect(() =>
      parseEnvironment({
        EXISTING_VIDEO_CHARACTER_SWAP_PROVIDER: 'decart',
        PRUNA_VIDEO_REPLACE_ENABLED: 'true',
      }),
    ).toThrow('PRUNA_API_KEY');
  });

  it('enables the pinned wardrobe model independently of existing-video provider choice', () => {
    expect(
      parseEnvironment({
        PRUNA_IMAGE_TRY_ON_ENABLED: 'true',
        PRUNA_API_KEY: ' wardrobe-secret ',
        PRUNA_IMAGE_TRY_ON_MODEL: ' p-image-try-on ',
      }),
    ).toMatchObject({
      existingVideoCharacterSwapProvider: 'decart',
      prunaImageTryOnEnabled: true,
      prunaApiKey: 'wardrobe-secret',
      prunaImageTryOnModel: 'p-image-try-on',
    });
  });

  it.each([
    ['PRUNA_API_KEY', { PRUNA_API_KEY: '' }],
    ['PRUNA_IMAGE_TRY_ON_MODEL', { PRUNA_IMAGE_TRY_ON_MODEL: '' }],
  ] as const)('names missing Wardrobe requirement %s when enabled', (variable, override) => {
    expect(() =>
      parseEnvironment({
        PRUNA_IMAGE_TRY_ON_ENABLED: 'true',
        PRUNA_API_KEY: 'wardrobe-secret',
        PRUNA_IMAGE_TRY_ON_MODEL: 'p-image-try-on',
        ...override,
      }),
    ).toThrow(variable);
  });

  it('selects Wiro independently and uses its timeout without requiring OpenAI image credentials', () => {
    expect(
      parseEnvironment({
        REFERENCE_IMAGE_PROVIDER: 'wiro',
        WIRO_API_KEY: ' wiro-key ',
        WIRO_API_SECRET: ' wiro-secret ',
        WIRO_REFERENCE_IMAGE_TIMEOUT_MS: '175000',
      }),
    ).toMatchObject({
      referenceImageProvider: 'wiro',
      wiroApiKey: 'wiro-key',
      wiroApiSecret: 'wiro-secret',
      wiroReferenceImageModel: 'seedream-v5-lite-uncensored',
      wiroReferenceImageTimeoutMs: 175_000,
      referenceImageTimeoutMs: 175_000,
    });
  });
});

describe('resolveLightframeDataDirectory', () => {
  const repositoryRoot = '/workspace/lightframe';
  const apiRoot = '/workspace/lightframe/apps/api';

  it('keeps absolute paths and resolves new relative paths from the repository root', () => {
    expect(
      resolveLightframeDataDirectory('/var/lib/lightframe', {
        repositoryRoot,
        apiRoot,
        pathExists: () => false,
      }),
    ).toEqual({ path: '/var/lib/lightframe', usesLegacyApiRelativePath: false });
    expect(
      resolveLightframeDataDirectory('./data', {
        repositoryRoot,
        apiRoot,
        pathExists: () => false,
      }),
    ).toEqual({ path: '/workspace/lightframe/data', usesLegacyApiRelativePath: false });
  });

  it('uses an existing legacy API-relative directory only when the canonical path is absent', () => {
    const legacy = '/workspace/lightframe/apps/api/data';
    expect(
      resolveLightframeDataDirectory('./data', {
        repositoryRoot,
        apiRoot,
        pathExists: (candidate) => candidate === legacy,
      }),
    ).toEqual({ path: legacy, usesLegacyApiRelativePath: true });

    expect(
      resolveLightframeDataDirectory('./data', {
        repositoryRoot,
        apiRoot,
        pathExists: () => true,
      }),
    ).toEqual({ path: '/workspace/lightframe/data', usesLegacyApiRelativePath: false });
  });
});

describe('resolveStaticRoot', () => {
  it('requires built web assets in production', () => {
    expect(() => resolveStaticRoot('production', '/workspace/web/dist', () => false)).toThrow(
      'The production web distribution is missing',
    );
  });

  it('allows explicit API-only development and test startup', () => {
    expect(resolveStaticRoot('development', '/workspace/web/dist', () => false)).toBeUndefined();
    expect(resolveStaticRoot('test', '/workspace/web/dist', () => false)).toBeUndefined();
    expect(resolveStaticRoot('production', '/workspace/web/dist', () => true)).toBe(
      '/workspace/web/dist',
    );
  });
});
