import { describe, expect, it } from 'vitest';
import {
  MAXIMUM_VIDEO_EDIT_OUTPUT_BYTES,
  VIDEO_EDIT_OUTPUT_BLOCK_BYTES,
  VideoEditChunkAccumulator,
} from './videoEditChunkAccumulator';

describe('VideoEditChunkAccumulator', () => {
  it('assembles offset writes across chunk boundaries without a growing contiguous buffer', async () => {
    const accumulator = new VideoEditChunkAccumulator();
    const boundary = VIDEO_EDIT_OUTPUT_BLOCK_BYTES;
    accumulator.write(new Uint8Array([5, 6, 7]), boundary - 1);
    accumulator.write(new Uint8Array([1, 2]), 0);

    const bytes = new Uint8Array(await accumulator.toBlob('video/mp4').arrayBuffer());
    expect(bytes.byteLength).toBe(boundary + 2);
    expect([...bytes.slice(0, 2)]).toEqual([1, 2]);
    expect([...bytes.slice(boundary - 1)]).toEqual([5, 6, 7]);
  });

  it('rejects invalid offsets and output beyond the 300 MB safety maximum before allocation', () => {
    const accumulator = new VideoEditChunkAccumulator();
    expect(() => accumulator.write(new Uint8Array([1]), -1)).toThrow(/invalid offset/iu);
    expect(() => accumulator.write(new Uint8Array([1]), MAXIMUM_VIDEO_EDIT_OUTPUT_BYTES)).toThrow(
      /300 MB/iu,
    );
  });

  it('releases accumulated chunks on clear', () => {
    const accumulator = new VideoEditChunkAccumulator();
    accumulator.write(new Uint8Array([1, 2, 3]), 0);
    accumulator.clear();
    expect(accumulator.toBlob('video/mp4').size).toBe(0);
  });
});
