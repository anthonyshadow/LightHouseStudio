import { access } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { spoolAudioUpload, SpooledUploadTooLargeError } from './spooled-upload.js';

describe('spoolAudioUpload', () => {
  it('writes a bounded private upload and cleans it idempotently', async () => {
    const upload = await spoolAudioUpload(Readable.from([Buffer.from('safe-audio')]), 20);
    expect(upload.byteLength).toBe(10);
    await expect(access(upload.path)).resolves.toBeUndefined();
    await upload.cleanup();
    await upload.cleanup();
    await expect(access(upload.path)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('removes partial output when the stream exceeds its limit', async () => {
    await expect(
      spoolAudioUpload(Readable.from([Buffer.alloc(5), Buffer.alloc(6)]), 10),
    ).rejects.toBeInstanceOf(SpooledUploadTooLargeError);
  });
});
