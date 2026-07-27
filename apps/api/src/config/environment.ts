import path from 'node:path';
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
export const DEFAULT_PROMPT_OPTIMIZER_TIMEOUT_MS = 120_000;
export const MAX_PROMPT_OPTIMIZER_TIMEOUT_MS = 180_000;
export const BFL_REFERENCE_IMAGE_MODEL = 'flux-2-pro' as const;
export const DEFAULT_BFL_SAFETY_TOLERANCE = 4;
export const DEFAULT_BFL_DISABLE_PROMPT_UPSAMPLING = true;

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

const promptOptimizerTimeoutSchema = z.preprocess(
  (value) => (value === undefined || value === '' ? DEFAULT_PROMPT_OPTIMIZER_TIMEOUT_MS : value),
  z.coerce.number().int().min(10_000).max(MAX_PROMPT_OPTIMIZER_TIMEOUT_MS),
);

const referenceImageTimeoutSchema = z.preprocess(
  (value) => (value === undefined || value === '' ? DEFAULT_REFERENCE_IMAGE_TIMEOUT_MS : value),
  z.coerce.number().int().min(10_000).max(MAX_PROMPT_OPTIMIZER_TIMEOUT_MS),
);

const strictBooleanSchema = (defaultValue: boolean) =>
  z.preprocess((value) => {
    if (value === undefined || value === '') return defaultValue;
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
    normalizeOptionalString,
    z.enum(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']).optional(),
  ),
  OPENAI_PROMPT_OPTIMIZER_VERSION: optionalModelSchema,
  OPENAI_PROMPT_OPTIMIZER_TIMEOUT_MS: promptOptimizerTimeoutSchema,
  OPENAI_REFERENCE_IMAGE_MODEL: optionalModelSchema,
  OPENAI_REFERENCE_IMAGE_QUALITY: z.preprocess(
    normalizeOptionalString,
    z.enum(['high', 'medium']).optional(),
  ),
  REFERENCE_IMAGE_PROVIDER: z.preprocess(
    normalizeOptionalString,
    z.enum(['openai', 'bfl']).default('openai'),
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
  BFL_REFERENCE_IMAGE_TIMEOUT_MS: referenceImageTimeoutSchema,
  ELEVENLABS_API_KEY: optionalSecretSchema,
  ELEVENLABS_STS_MODEL_ID: optionalModelSchema,
  ELEVENLABS_ENABLE_LOGGING: strictBooleanSchema(false),
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
  readonly referenceImageProvider: 'openai' | 'bfl';
  readonly bflApiKey?: string;
  readonly bflReferenceImageModel: typeof BFL_REFERENCE_IMAGE_MODEL;
  readonly bflSafetyTolerance: number;
  readonly bflDisablePromptUpsampling: boolean;
  readonly bflReferenceImageTimeoutMs: number;
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
    ...(result.data.ELEVENLABS_API_KEY === undefined
      ? {}
      : { elevenLabsApiKey: result.data.ELEVENLABS_API_KEY }),
    elevenLabsModelId: result.data.ELEVENLABS_STS_MODEL_ID ?? DEFAULT_ELEVENLABS_STS_MODEL_ID,
    elevenLabsEnableLogging: result.data.ELEVENLABS_ENABLE_LOGGING,
    providerTimeoutMs: 30_000,
    referenceImageTimeoutMs:
      result.data.REFERENCE_IMAGE_PROVIDER === 'bfl'
        ? result.data.BFL_REFERENCE_IMAGE_TIMEOUT_MS
        : DEFAULT_REFERENCE_IMAGE_TIMEOUT_MS,
    lightframeDataDir: result.data.LIGHTFRAME_DATA_DIR,
  };
};
