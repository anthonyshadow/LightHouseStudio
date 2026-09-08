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

/*
 * Resolved through `node:path` rather than `new URL(…, import.meta.url)`: a jsdom suite is
 * transformed for the browser, and Vite rewrites that literal pattern into a dev-server asset URL,
 * which `readFile` then refuses as not a file.
 */
const fixturesDirectory = join(dirname(fileURLToPath(import.meta.url)), '../../../../e2e/fixtures');

/**
 * 1080x1920 HEVC in QuickTime: bytes this product cannot publish, so the intake either converts
 * them here or says it cannot. Typed as `Buffer<ArrayBuffer>` rather than the default
 * `Buffer<ArrayBufferLike>` because a suite hands these straight to `File`, and a possibly-shared
 * buffer is not a `BlobPart`.
 */
export const loadPhoneHevcVideoFixture = async (): Promise<Buffer<ArrayBuffer>> => {
  const source = await readFile(join(fixturesDirectory, 'phone-hevc-video.base64'), 'utf8');
  // The committed form is wrapped at 100 columns; the wrapping is not part of the video.
  return Buffer.from(source.replaceAll(/\s/gu, ''), 'base64');
};
