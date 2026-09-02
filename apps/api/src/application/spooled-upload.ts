import { createHash } from 'node:crypto';
import { chmod, mkdtemp, open, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { withWorkflowSpan } from '../observability/telemetry.js';

export interface SpooledUpload {
  readonly kind: 'spooled-upload';
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

export const isSpooledUpload = (value: unknown): value is SpooledUpload =>
  typeof value === 'object' &&
  value !== null &&
  'kind' in value &&
  value.kind === 'spooled-upload' &&
  'path' in value &&
  typeof value.path === 'string' &&
  'byteLength' in value &&
  typeof value.byteLength === 'number' &&
  'checksumSha256' in value &&
  typeof value.checksumSha256 === 'string' &&
  /^[a-f0-9]{64}$/u.test(value.checksumSha256) &&
  'cleanup' in value &&
  typeof value.cleanup === 'function';

export const spoolUpload = (source: Readable, maximumBytes: number): Promise<SpooledUpload> =>
  withWorkflowSpan(
    'temporary_file.create',
    { 'lightframe.maximum_bytes': maximumBytes },
    async () => {
      const directory = await mkdtemp(path.join(tmpdir(), 'lightframe-upload-'));
      const filePath = path.join(directory, 'upload.bin');
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
          kind: 'spooled-upload',
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
    },
  );
