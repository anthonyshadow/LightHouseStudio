import { readFile } from 'node:fs/promises';

/**
 * The committed video fixtures, read once for the browser journeys.
 *
 * Stated beside the bytes and free of `@playwright/test`, so the reader is about the files rather
 * than about a `Page`; the harness re-exports what follows. A Vitest suite cannot import this
 * module — `scripts/check-module-graph.mjs` fails any relative import that leaves its workspace —
 * so each app says the same reader once, in its own `src/test/videoFixtures.ts`.
 */
const loadBase64VideoFixture = async (filename: string): Promise<Buffer> => {
  const source = await readFile(new URL(`./${filename}`, import.meta.url), 'utf8');
  // The committed form is wrapped at 100 columns; the wrapping is not part of the video.
  return Buffer.from(source.replaceAll(/\s/gu, ''), 'base64');
};

export const loadDecodableH264VideoFixture = async (): Promise<Buffer> =>
  loadBase64VideoFixture('decodable-h264-video.base64');

/** 1080x1920 H.264, video only — the portrait source a 9:16 cut and its placement set start from. */
export const loadPortraitH264VideoFixture = async (): Promise<Buffer> =>
  loadBase64VideoFixture('portrait-h264-video.base64');

/**
 * 1080x1920 HEVC in QuickTime: bytes this product cannot publish, so the intake either converts
 * them here or says it cannot. Evidence about the codec branch only — see `./README.md` for what
 * an `ffmpeg` clip does not carry that a phone's own file would.
 */
export const loadPhoneHevcVideoFixture = async (): Promise<Buffer> =>
  loadBase64VideoFixture('phone-hevc-video.base64');
