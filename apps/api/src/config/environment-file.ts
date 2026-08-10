import path from 'node:path';
import { existsSync } from 'node:fs';

export type LightframeEnvironment = 'development' | 'production';

export class EnvironmentProfileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EnvironmentProfileError';
  }
}

export interface LoadSelectedEnvironmentFileOptions {
  readonly repositoryRoot: string;
  readonly environment: NodeJS.ProcessEnv;
  readonly pathExists?: (candidate: string) => boolean;
  readonly load: (path: string, environment: NodeJS.ProcessEnv) => unknown;
}

const expectedNodeEnvironment = (profile: LightframeEnvironment): 'development' | 'production' =>
  profile;

export const selectedEnvironmentFile = (
  repositoryRoot: string,
  profile: LightframeEnvironment,
): string => path.join(repositoryRoot, `.env.${profile}`);

export const loadSelectedEnvironmentFile = (
  options: LoadSelectedEnvironmentFileOptions,
): LightframeEnvironment | null => {
  const selected = options.environment.LIGHTFRAME_ENV;
  if (selected === undefined || selected === '') {
    if (options.environment.NODE_ENV === 'test') return null;
    if (options.environment.LIGHTFRAME_ENV_SOURCE === 'process') return null;
    throw new EnvironmentProfileError(
      'Set LIGHTFRAME_ENV=development or production, or use LIGHTFRAME_ENV_SOURCE=process for an explicit process-only smoke.',
    );
  }
  if (selected !== 'development' && selected !== 'production') {
    throw new EnvironmentProfileError('LIGHTFRAME_ENV must be development or production.');
  }

  const source = options.environment.LIGHTFRAME_ENV_SOURCE ?? 'file';
  if (source !== 'file' && source !== 'process') {
    throw new EnvironmentProfileError('LIGHTFRAME_ENV_SOURCE must be file or process.');
  }
  if (source === 'file') {
    const candidate = selectedEnvironmentFile(options.repositoryRoot, selected);
    if (!(options.pathExists ?? existsSync)(candidate)) {
      throw new EnvironmentProfileError(
        `The ${selected} environment file is missing. Copy .env.${selected}.example to .env.${selected} and configure it.`,
      );
    }
    options.load(candidate, options.environment);
  }

  const expected = expectedNodeEnvironment(selected);
  if (options.environment.NODE_ENV !== expected) {
    throw new EnvironmentProfileError(`LIGHTFRAME_ENV=${selected} requires NODE_ENV=${expected}.`);
  }
  return selected;
};
