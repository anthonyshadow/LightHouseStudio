import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The committed video fixtures, read once for this workspace.
 *
 * `e2e/fixtures` owns the bytes, and `e2e/fixtures/videoFixtures.ts` reads them for the browser
 * journeys. A suite here cannot import that module — `scripts/check-module-graph.mjs` fails any
 * relative import that leaves its workspace — so the reader is stated once per side of that
 * boundary, never again per suite.
 */
const fixturesDirectory = join(dirname(fileURLToPath(import.meta.url)), '../../../../e2e/fixtures');

/** 1280x720 H.264 that really decodes, so an inspection has something to be right or wrong on. */
export const loadDecodableH264VideoFixture = async (): Promise<Buffer<ArrayBuffer>> => {
  const source = await readFile(join(fixturesDirectory, 'decodable-h264-video.base64'), 'utf8');
  // The committed form is wrapped at 100 columns; the wrapping is not part of the video.
  return Buffer.from(source.replaceAll(/\s/gu, ''), 'base64');
};
