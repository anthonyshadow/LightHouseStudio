export type BoundedBlobFailure = 'invalid' | 'too-large';

export type ReadBoundedBlobOptions = Readonly<{
  maximumBytes: number;
  signal: AbortSignal;
  acceptsContentType: (contentType: string) => boolean;
  createError: (failure: BoundedBlobFailure) => Error;
  abortMessage: string;
  /** Called after each chunk with cumulative bytes; total is null when the length is undeclared. */
  onProgress?: (receivedBytes: number, totalBytes: number | null) => void;
}>;

const declaredContentLength = (response: Response): number | null | undefined => {
  const header = response.headers.get('content-length');
  if (header === null) return undefined;
  if (!/^\d+$/u.test(header)) return null;
  const value = Number(header);
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
};

/** Streams a browser response into a Blob while enforcing its bound before full allocation. */
export const readBoundedBlob = async (
  response: Response,
  options: ReadBoundedBlobOptions,
): Promise<Blob> => {
  const contentType =
    response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() ?? '';
  const contentLength = declaredContentLength(response);
  if (
    !options.acceptsContentType(contentType) ||
    contentLength === null ||
    response.body === null
  ) {
    void response.body?.cancel().catch(() => undefined);
    throw options.createError('invalid');
  }
  if (contentLength !== undefined && contentLength > options.maximumBytes) {
    void response.body.cancel().catch(() => undefined);
    throw options.createError('too-large');
  }

  const reader = response.body.getReader();
  const chunks: ArrayBuffer[] = [];
  let byteLength = 0;
  let completed = false;
  let expectedError: Error | null = null;
  const abortReader = () => void reader.cancel().catch(() => undefined);
  options.signal.addEventListener('abort', abortReader, { once: true });
  try {
    options.signal.throwIfAborted();
    while (true) {
      const chunk = await reader.read();
      options.signal.throwIfAborted();
      if (chunk.done) {
        completed = true;
        break;
      }
      if (chunk.value.byteLength === 0) continue;
      byteLength += chunk.value.byteLength;
      if (byteLength > options.maximumBytes) {
        expectedError = options.createError('too-large');
        throw expectedError;
      }
      const copy = new Uint8Array(chunk.value.byteLength);
      copy.set(chunk.value);
      chunks.push(copy.buffer);
      options.onProgress?.(byteLength, contentLength ?? null);
    }
  } catch (error) {
    if (options.signal.aborted) throw new DOMException(options.abortMessage, 'AbortError');
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    if (error === expectedError) throw error;
    throw options.createError('invalid');
  } finally {
    options.signal.removeEventListener('abort', abortReader);
    if (!completed) await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  if (byteLength === 0 || (contentLength !== undefined && contentLength !== byteLength)) {
    throw options.createError('invalid');
  }
  return new Blob(chunks, { type: contentType });
};
