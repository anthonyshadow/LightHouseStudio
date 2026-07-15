import { z } from 'zod';

export const DEFAULT_API_PORT = 4100;
export const DEFAULT_ELEVENLABS_STS_MODEL_ID = 'eleven_multilingual_sts_v2';

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
  ELEVENLABS_API_KEY: optionalSecretSchema,
  ELEVENLABS_STS_MODEL_ID: optionalModelSchema,
  ELEVENLABS_ENABLE_LOGGING: strictBooleanSchema,
});

export interface RuntimeConfig {
  readonly nodeEnv: 'development' | 'test' | 'production';
  readonly host: '127.0.0.1';
  readonly port: number;
  readonly decartApiKey?: string;
  readonly elevenLabsApiKey?: string;
  readonly elevenLabsModelId: string;
  readonly elevenLabsEnableLogging: boolean;
  readonly providerTimeoutMs: number;
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
    ...(result.data.ELEVENLABS_API_KEY === undefined
      ? {}
      : { elevenLabsApiKey: result.data.ELEVENLABS_API_KEY }),
    elevenLabsModelId: result.data.ELEVENLABS_STS_MODEL_ID ?? DEFAULT_ELEVENLABS_STS_MODEL_ID,
    elevenLabsEnableLogging: result.data.ELEVENLABS_ENABLE_LOGGING,
    providerTimeoutMs: 30_000,
  };
};
