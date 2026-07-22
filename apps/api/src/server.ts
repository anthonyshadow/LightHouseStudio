import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config as loadEnvironment } from 'dotenv';
import { createApp } from './app.js';
import {
  parseEnvironment,
  resolveLightframeDataDirectory,
  resolveStaticRoot,
} from './config/environment.js';

loadEnvironment({
  path: fileURLToPath(new URL('../../../.env', import.meta.url)),
  quiet: true,
});

const parsedConfig = parseEnvironment(process.env);
const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));
const apiRoot = fileURLToPath(new URL('../', import.meta.url));
const dataDirectory = resolveLightframeDataDirectory(parsedConfig.lightframeDataDir, {
  repositoryRoot,
  apiRoot,
  pathExists: existsSync,
});
const config = { ...parsedConfig, lightframeDataDir: dataDirectory.path };
const webDistributionPath = fileURLToPath(new URL('../../web/dist/', import.meta.url));
const staticRoot = resolveStaticRoot(config.nodeEnv, webDistributionPath, existsSync);
const app = createApp({
  config,
  ...(staticRoot === undefined ? {} : { staticRoot }),
});
if (dataDirectory.usesLegacyApiRelativePath) {
  app.log.warn(
    'Using the legacy API-relative Lightframe data directory because the repository-relative directory is absent.',
  );
}

const close = async (signal: NodeJS.Signals): Promise<void> => {
  app.log.info({ signal }, 'Shutting down local Studio API');
  await app.close();
  process.exitCode = 0;
};

process.once('SIGINT', () => void close('SIGINT'));
process.once('SIGTERM', () => void close('SIGTERM'));

await app.listen({ host: config.host, port: config.port });
