import { z } from 'zod';
import {
  CHARACTER_PROMPT_OPTIMIZER_DEFAULT_MODEL,
  CHARACTER_PROMPT_OPTIMIZER_DEFAULT_REASONING,
  CHARACTER_PROMPT_OPTIMIZER_DEFAULT_VERSION,
  REFERENCE_IMAGE_MODEL_ID,
  REFERENCE_IMAGE_QUALITY,
} from '@studio/contracts';

export const DEFAULT_API_PORT = 4100;
export const DEFAULT_ELEVENLABS_STS_MODEL_ID = 'eleven_multilingual_sts_v2';
export const DEFAULT_LIGHTFRAME_DATA_DIR = './.lightframe-data';
export const DEFAULT_REFERENCE_IMAGE_TIMEOUT_MS = 150_000;
export const DEFAULT_PROMPT_OPTIMIZER_TIMEOUT_MS = 30_000;

const optionalSecretSchema = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().trim().min(1).optional(),
);

const optionalModelSchema = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().trim().min(1).max(128).optional(),
);

const portSchema = z.preprocess(
  (value) => (value === undefined || value === '' ? DEFAULT_API_PORT : value),
  z.coerce.number().int().min(1).max(65_535),
);

const strictBooleanSchema = z.preprocess((value) => {
  if (value === undefined || value === '') return false;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}, z.boolean());

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: portSchema,
  DECART_API_KEY: optionalSecretSchema,
  OPENAI_API_KEY: optionalSecretSchema,
  OPENAI_PROMPT_OPTIMIZER_MODEL: optionalModelSchema,
  OPENAI_PROMPT_OPTIMIZER_REASONING: z.preprocess(
    (value) =>
      typeof value === 'string' ? (value.trim() === '' ? undefined : value.trim()) : value,
    z.enum(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']).optional(),
  ),
  OPENAI_PROMPT_OPTIMIZER_VERSION: optionalModelSchema,
  OPENAI_REFERENCE_IMAGE_MODEL: optionalModelSchema,
  OPENAI_REFERENCE_IMAGE_QUALITY: z.preprocess(
    (value) =>
      typeof value === 'string' ? (value.trim() === '' ? undefined : value.trim()) : value,
    z.enum(['high', 'medium']).optional(),
  ),
  ELEVENLABS_API_KEY: optionalSecretSchema,
  ELEVENLABS_STS_MODEL_ID: optionalModelSchema,
  ELEVENLABS_ENABLE_LOGGING: strictBooleanSchema,
  LIGHTFRAME_DATA_DIR: z.preprocess(
    (value) => (value === undefined || value === '' ? DEFAULT_LIGHTFRAME_DATA_DIR : value),
    z.string().trim().min(1),
  ),
});

export interface RuntimeConfig {
  readonly nodeEnv: 'development' | 'test' | 'production';
  readonly host: '127.0.0.1';
  readonly port: number;
  readonly decartApiKey?: string;
  readonly openAiApiKey?: string;
  readonly openAiPromptOptimizerModel: string;
  readonly openAiPromptOptimizerReasoning:
    'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  readonly openAiPromptOptimizerVersion: string;
  readonly openAiPromptOptimizerTimeoutMs: number;
  readonly openAiReferenceImageModel: string;
  readonly openAiReferenceImageQuality: 'high' | 'medium';
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
    ...(result.data.DECART_API_KEY === undefined
      ? {}
      : { decartApiKey: result.data.DECART_API_KEY }),
    ...(result.data.OPENAI_API_KEY === undefined
      ? {}
      : { openAiApiKey: result.data.OPENAI_API_KEY }),
    openAiPromptOptimizerModel:
      result.data.OPENAI_PROMPT_OPTIMIZER_MODEL ?? CHARACTER_PROMPT_OPTIMIZER_DEFAULT_MODEL,
    openAiPromptOptimizerReasoning:
      result.data.OPENAI_PROMPT_OPTIMIZER_REASONING ?? CHARACTER_PROMPT_OPTIMIZER_DEFAULT_REASONING,
    openAiPromptOptimizerVersion:
      result.data.OPENAI_PROMPT_OPTIMIZER_VERSION ?? CHARACTER_PROMPT_OPTIMIZER_DEFAULT_VERSION,
    openAiPromptOptimizerTimeoutMs: DEFAULT_PROMPT_OPTIMIZER_TIMEOUT_MS,
    openAiReferenceImageModel: result.data.OPENAI_REFERENCE_IMAGE_MODEL ?? REFERENCE_IMAGE_MODEL_ID,
    openAiReferenceImageQuality:
      result.data.OPENAI_REFERENCE_IMAGE_QUALITY ?? REFERENCE_IMAGE_QUALITY,
    ...(result.data.ELEVENLABS_API_KEY === undefined
      ? {}
      : { elevenLabsApiKey: result.data.ELEVENLABS_API_KEY }),
    elevenLabsModelId: result.data.ELEVENLABS_STS_MODEL_ID ?? DEFAULT_ELEVENLABS_STS_MODEL_ID,
    elevenLabsEnableLogging: result.data.ELEVENLABS_ENABLE_LOGGING,
    providerTimeoutMs: 30_000,
    referenceImageTimeoutMs: DEFAULT_REFERENCE_IMAGE_TIMEOUT_MS,
    lightframeDataDir: result.data.LIGHTFRAME_DATA_DIR,
  };
};
