export const MAXIMUM_VIDEO_EDIT_OUTPUT_BYTES = 300_000_000;
export const VIDEO_EDIT_OUTPUT_BLOCK_BYTES = 4 * 1024 * 1024;

export class VideoEditChunkAccumulator {
  private readonly blocks = new Map<number, Uint8Array>();
  private size = 0;

  write(data: Uint8Array, position: number): void {
    if (!Number.isSafeInteger(position) || position < 0) {
      throw new Error('The edited video writer received an invalid offset.');
    }
    const end = position + data.byteLength;
    if (end > MAXIMUM_VIDEO_EDIT_OUTPUT_BYTES) {
      throw new Error('The edited video exceeded the 300 MB safety limit.');
    }
    let sourceOffset = 0;
    while (sourceOffset < data.byteLength) {
      const absoluteOffset = position + sourceOffset;
      const blockIndex = Math.floor(absoluteOffset / VIDEO_EDIT_OUTPUT_BLOCK_BYTES);
      const blockOffset = absoluteOffset % VIDEO_EDIT_OUTPUT_BLOCK_BYTES;
      const copyLength = Math.min(
        VIDEO_EDIT_OUTPUT_BLOCK_BYTES - blockOffset,
        data.byteLength - sourceOffset,
      );
      const block = this.blocks.get(blockIndex) ?? new Uint8Array(VIDEO_EDIT_OUTPUT_BLOCK_BYTES);
      block.set(data.subarray(sourceOffset, sourceOffset + copyLength), blockOffset);
      this.blocks.set(blockIndex, block);
      sourceOffset += copyLength;
    }
    this.size = Math.max(this.size, end);
  }

  toBlob(type: string): Blob {
    const parts: BlobPart[] = [];
    const blockCount = Math.ceil(this.size / VIDEO_EDIT_OUTPUT_BLOCK_BYTES);
    for (let index = 0; index < blockCount; index += 1) {
      const remaining = this.size - index * VIDEO_EDIT_OUTPUT_BLOCK_BYTES;
      const length = Math.min(VIDEO_EDIT_OUTPUT_BLOCK_BYTES, remaining);
      const block = this.blocks.get(index) ?? new Uint8Array(length);
      const part = block.byteLength === length ? block : block.subarray(0, length);
      parts.push(Uint8Array.from(part).buffer);
    }
    return new Blob(parts, { type });
  }

  clear(): void {
    this.blocks.clear();
    this.size = 0;
  }
}
