import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const keys = async (relativePath: string): Promise<string[]> => {
  const contents = await readFile(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8');
  return contents
    .split(/\r?\n/u)
    .map((line) => line.match(/^([A-Z][A-Z0-9_]*)=/u)?.[1])
    .filter((key): key is string => key !== undefined)
    .sort();
};

describe('environment examples', () => {
  it('keeps development and production runtime keys in parity', async () => {
    const development = await keys('../../../../.env.development.example');
    const production = await keys('../../../../.env.production.example');
    expect(development).toEqual(production);
    expect(new Set(development).size).toBe(development.length);
  });

  it('keeps management-only Cloudflare variables out of application runtime profiles', async () => {
    const development = await keys('../../../../.env.development.example');
    expect(development).not.toContain('CLOUDFLARE_API_TOKEN');
    expect(development).not.toContain('S3_API_URL');
  });
});
