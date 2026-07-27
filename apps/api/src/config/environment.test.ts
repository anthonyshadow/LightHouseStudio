import { describe, expect, it } from 'vitest';
import {
  DEFAULT_API_PORT,
  DEFAULT_ELEVENLABS_STS_MODEL_ID,
  DEFAULT_LIGHTFRAME_DATA_DIR,
  DEFAULT_PROMPT_OPTIMIZER_TIMEOUT_MS,
  DEFAULT_REFERENCE_IMAGE_TIMEOUT_MS,
  DEFAULT_WIRO_REFERENCE_IMAGE_TIMEOUT_MS,
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
      elevenLabsModelId: DEFAULT_ELEVENLABS_STS_MODEL_ID,
      elevenLabsEnableLogging: false,
      lightframeDataDir: DEFAULT_LIGHTFRAME_DATA_DIR,
      referenceImageTimeoutMs: DEFAULT_REFERENCE_IMAGE_TIMEOUT_MS,
      openAiPromptOptimizerModel: 'gpt-5.6',
      openAiPromptOptimizerReasoning: 'medium',
      openAiPromptOptimizerVersion: 'lucy-character-reference-v1',
      openAiPromptOptimizerTimeoutMs: DEFAULT_PROMPT_OPTIMIZER_TIMEOUT_MS,
      openAiReferenceImageModel: 'gpt-image-2',
      openAiReferenceImageQuality: 'high',
      referenceImageProvider: 'openai',
      bflReferenceImageModel: 'flux-2-pro',
      bflSafetyTolerance: 4,
      bflDisablePromptUpsampling: true,
      bflReferenceImageTimeoutMs: DEFAULT_REFERENCE_IMAGE_TIMEOUT_MS,
      wiroReferenceImageModel: 'seedream-v5-lite-uncensored',
      wiroReferenceImageTimeoutMs: DEFAULT_WIRO_REFERENCE_IMAGE_TIMEOUT_MS,
    });
  });

  it('trims configured values and parses strict booleans', () => {
    expect(
      parseEnvironment({
        NODE_ENV: 'production',
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

  it.each([
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
  ])('rejects invalid environment input %#', (environment) => {
    expect(() => parseEnvironment(environment)).toThrow(EnvironmentValidationError);
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
