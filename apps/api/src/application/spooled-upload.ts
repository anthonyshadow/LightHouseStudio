import { createHash } from 'node:crypto';
import { chmod, mkdtemp, open, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Readable } from 'node:stream';

export interface SpooledAudioUpload {
  readonly kind: 'spooled-audio-upload';
  readonly path: string;
  readonly byteLength: number;
  readonly checksumSha256: string;
  cleanup(): Promise<void>;
}

export class SpooledUploadTooLargeError extends Error {
  constructor() {
    super('The upload exceeds its byte limit.');
    this.name = 'SpooledUploadTooLargeError';
  }
}

export const isSpooledAudioUpload = (value: unknown): value is SpooledAudioUpload =>
  typeof value === 'object' &&
  value !== null &&
  'kind' in value &&
  value.kind === 'spooled-audio-upload' &&
  'path' in value &&
  typeof value.path === 'string' &&
  'byteLength' in value &&
  typeof value.byteLength === 'number' &&
  'checksumSha256' in value &&
  typeof value.checksumSha256 === 'string' &&
  /^[a-f0-9]{64}$/u.test(value.checksumSha256) &&
  'cleanup' in value &&
  typeof value.cleanup === 'function';

export const spoolAudioUpload = async (
  source: Readable,
  maximumBytes: number,
): Promise<SpooledAudioUpload> => {
  const directory = await mkdtemp(path.join(tmpdir(), 'lightframe-voice-upload-'));
  const filePath = path.join(directory, 'recording.audio');
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  let byteLength = 0;
  const hash = createHash('sha256');
  try {
    await chmod(directory, 0o700);
    handle = await open(filePath, 'wx', 0o600);
    for await (const rawChunk of source) {
      const chunk = Buffer.isBuffer(rawChunk) ? rawChunk : Buffer.from(rawChunk as Uint8Array);
      byteLength += chunk.byteLength;
      if (byteLength > maximumBytes) throw new SpooledUploadTooLargeError();
      await handle.write(chunk);
      hash.update(chunk);
    }
    await handle.sync();
    await handle.close();
    handle = undefined;
    let cleaned = false;
    return {
      kind: 'spooled-audio-upload',
      path: filePath,
      byteLength,
      checksumSha256: hash.digest('hex'),
      cleanup: async () => {
        if (cleaned) return;
        cleaned = true;
        await rm(directory, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await handle?.close().catch(() => undefined);
    await rm(directory, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
};
