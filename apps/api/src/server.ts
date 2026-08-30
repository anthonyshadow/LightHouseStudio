import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config as loadEnvironment } from 'dotenv';
import { createApp } from './app.js';
import { loadSelectedEnvironmentFile } from './config/environment-file.js';
import {
  parseEnvironment,
  resolveLightframeDataDirectory,
  resolveStaticRoot,
} from './config/environment.js';
import { createConfiguredPersistence } from './infrastructure/persistence-factory.js';

const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));
loadSelectedEnvironmentFile({
  repositoryRoot,
  environment: process.env,
  load: (path, environment) =>
    loadEnvironment({ path, processEnv: environment, quiet: true, override: false }),
});

const parsedConfig = parseEnvironment(process.env);
const apiRoot = fileURLToPath(new URL('../', import.meta.url));
const dataDirectory = resolveLightframeDataDirectory(parsedConfig.lightframeDataDir, {
  repositoryRoot,
  apiRoot,
  pathExists: existsSync,
});
const config = { ...parsedConfig, lightframeDataDir: dataDirectory.path };
const webDistributionPath = fileURLToPath(new URL('../../web/dist/', import.meta.url));
const staticRoot = resolveStaticRoot(config.nodeEnv, webDistributionPath, existsSync);
const persistence = await createConfiguredPersistence(config);
const app = createApp({
  config,
  ...(persistence === undefined ? {} : { persistence }),
  ...(staticRoot === undefined ? {} : { staticRoot }),
});
if (dataDirectory.usesLegacyApiRelativePath) {
  app.log.info(
    'Using the existing API-relative Lightframe data directory for backward compatibility.',
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

// Announced deliberately. Until this line the API said nothing until it shut down, so a healthy
// server was indistinguishable from a crashed one — most visibly beside the Vite banner under
// `dev:servers`, where only the web half ever spoke. Keys are reported as booleans, never values:
// a startup line is exactly the kind of place a secret leaks into a log.
app.log.info(
  {
    url: `http://${config.host}:${config.port}`,
    databaseMode: config.databaseMode,
    dataDirectory: config.lightframeDataDir,
    characterSwapProvider: config.existingVideoCharacterSwapProvider,
    providersConfigured: {
      decart: config.decartApiKey !== undefined,
      pruna: config.prunaVideoReplaceEnabled,
      elevenLabs: config.elevenLabsApiKey !== undefined,
      openAi: config.openAiApiKey !== undefined,
      wiro: config.wiroApiKey !== undefined,
    },
  },
  'Lightframe Studio API ready',
);
