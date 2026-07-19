import { describe, expect, it } from 'vitest';
import {
  DEFAULT_API_PORT,
  DEFAULT_ELEVENLABS_STS_MODEL_ID,
  DEFAULT_LIGHTFRAME_DATA_DIR,
  DEFAULT_PROMPT_OPTIMIZER_TIMEOUT_MS,
  DEFAULT_REFERENCE_IMAGE_TIMEOUT_MS,
  EnvironmentValidationError,
  parseEnvironment,
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
        OPENAI_REFERENCE_IMAGE_MODEL: ' gpt-image-test ',
        OPENAI_REFERENCE_IMAGE_QUALITY: ' medium ',
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
      openAiReferenceImageModel: 'gpt-image-test',
      openAiReferenceImageQuality: 'medium',
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
    { OPENAI_REFERENCE_IMAGE_QUALITY: 'low' },
  ])('rejects invalid environment input %#', (environment) => {
    expect(() => parseEnvironment(environment)).toThrow(EnvironmentValidationError);
  });
});
