import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config as loadEnvironment } from 'dotenv';
import { createApp } from './app.js';
import { parseEnvironment } from './config/environment.js';

loadEnvironment({
  path: fileURLToPath(new URL('../../../.env', import.meta.url)),
  quiet: true,
});

const config = parseEnvironment(process.env);
const webDistributionPath = fileURLToPath(new URL('../../web/dist/', import.meta.url));
const app = createApp({
  config,
  ...(existsSync(webDistributionPath) ? { staticRoot: webDistributionPath } : {}),
});

const close = async (signal: NodeJS.Signals): Promise<void> => {
  app.log.info({ signal }, 'Shutting down local Studio API');
  await app.close();
  process.exitCode = 0;
};

process.once('SIGINT', () => void close('SIGINT'));
process.once('SIGTERM', () => void close('SIGTERM'));

await app.listen({ host: config.host, port: config.port });
