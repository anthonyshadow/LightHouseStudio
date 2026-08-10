import { chmod, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));
const legacyPath = fileURLToPath(new URL('../../../.env', import.meta.url));
const developmentExamplePath = fileURLToPath(
  new URL('../../../.env.development.example', import.meta.url),
);
const productionExamplePath = fileURLToPath(
  new URL('../../../.env.production.example', import.meta.url),
);
const developmentPath = fileURLToPath(new URL('../../../.env.development', import.meta.url));
const productionPath = fileURLToPath(new URL('../../../.env.production', import.meta.url));

const setEntry = (contents: string, key: string, value: string): string => {
  const entry = `${key}=${value}`;
  const matcher = new RegExp(`^${key}=.*$`, 'mu');
  return matcher.test(contents) ? contents.replace(matcher, entry) : `${entry}\n${contents}`;
};

const removeManagementEntries = (contents: string): string =>
  contents
    .split(/\r?\n/u)
    .filter((line) => !line.startsWith('CLOUDFLARE_API_TOKEN=') && !line.startsWith('S3_API_URL='))
    .join('\n');

const createPrivateFile = async (path: string, contents: string): Promise<boolean> => {
  try {
    await writeFile(path, contents.endsWith('\n') ? contents : `${contents}\n`, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    });
    await chmod(path, 0o600);
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'EEXIST') return false;
    throw error;
  }
};

const development = await readFile(developmentExamplePath, 'utf8');
const createdDevelopment = await createPrivateFile(developmentPath, development);

const productionExample = await readFile(productionExamplePath, 'utf8');
const legacy = await readFile(legacyPath, 'utf8').catch(() => productionExample);
let production = removeManagementEntries(legacy);
production = setEntry(production, 'LIGHTFRAME_ENV', 'production');
production = setEntry(production, 'NODE_ENV', 'production');
production = setEntry(production, 'DEMO_AUTH_PREFILL', 'false');
production = setEntry(production, 'AUTH_COOKIE_NAME', 'lightframe_session_production');
production = setEntry(production, 'LIGHTFRAME_DATA_DIR', './.lightframe-data/production');
const createdProduction = await createPrivateFile(productionPath, production);

console.log(
  JSON.stringify({
    repositoryRoot,
    development: createdDevelopment ? 'created' : 'preserved',
    production: createdProduction ? 'created' : 'preserved',
    productionCredentialRotationRequired: true,
  }),
);
