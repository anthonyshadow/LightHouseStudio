import type { HttpReply, HttpRequest } from '../../application/application-runtime.js';
import { AppError } from '../../http/app-error.js';
import { requestHeader } from '../../http/request-helpers.js';
import type { AssetReadHandle } from '../../storage/asset-byte-store.js';

export interface ByteRange {
  readonly start: number;
  readonly end: number;
}

/** `bytes=<first>-<last>` with an optional last, or the suffix form `bytes=-<length>`. */
const SINGLE_BYTE_RANGE = /^bytes=(?:(\d+)-(\d*)|-(\d+))$/u;

const unsatisfiableRange = (): AppError =>
  new AppError(416, 'validation_error', 'The requested byte range is unavailable.');

/**
 * Resolves one supported byte range, or `null` when the whole representation should be sent.
 *
 * A Range this server does not support — another unit, a multi-range set, a malformed value — is
 * ignored rather than refused, which is what RFC 9110 requires: the client still receives the
 * complete representation. Only a range this server understands *and* cannot satisfy is a 416, and
 * `sendRangedAsset` pairs that with the `Content-Range: bytes * /size` the status requires.
 */
export const parseByteRange = (value: string | undefined, size: number): ByteRange | null => {
  if (value === undefined) return null;
  const match = SINGLE_BYTE_RANGE.exec(value.trim());
  if (match === null) return null;

  let start: number;
  let end: number;
  if (match[3] !== undefined) {
    // Suffix range: the last N bytes, clamped to the whole representation when N exceeds it.
    const length = Number(match[3]);
    if (length <= 0) throw unsatisfiableRange();
    start = length >= size ? 0 : size - length;
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = Math.min(match[2] ? Number(match[2]) : size - 1, size - 1);
  }
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    start > end ||
    start >= size
  ) {
    throw unsatisfiableRange();
  }
  return { start, end };
};

export const contentRangeHeaders = (
  range: ByteRange,
  size: number,
): Readonly<{ contentRange: string; contentLength: number }> => ({
  contentRange: `bytes ${range.start}-${range.end}/${size}`,
  contentLength: range.end - range.start + 1,
});

const downloadRequested = (request: HttpRequest): boolean =>
  typeof request.query === 'object' &&
  request.query !== null &&
  'download' in request.query &&
  request.query.download === 'true';

/**
 * The one owner of the media byte-serving contract: range negotiation, sniffing protection and
 * inline/attachment disposition. Every asset download route goes through here.
 */
export const sendRangedAsset = (
  request: HttpRequest,
  reply: HttpReply,
  media: {
    readonly asset: AssetReadHandle;
    readonly mimeType: string;
    readonly filename: string;
    /** Omit to honour `?download=true`; pass `false` for routes that never attach. */
    readonly allowDownload?: boolean;
  },
) => {
  const size = media.asset.manifest.sizeBytes;
  let range: ByteRange | null;
  try {
    range = parseByteRange(requestHeader(request, 'range'), size);
  } catch (error) {
    // A 416 must state the selected representation's length, so the client can ask again.
    void reply.header('Accept-Ranges', 'bytes');
    void reply.header('Content-Range', `bytes */${size}`);
    throw error;
  }
  const filename = media.filename.replaceAll(/["\\\r\n]/gu, '_');
  const download = (media.allowDownload ?? true) && downloadRequested(request);
  void reply.header('Accept-Ranges', 'bytes');
  void reply.header('Content-Type', media.mimeType);
  void reply.header('X-Content-Type-Options', 'nosniff');
  void reply.header(
    'Content-Disposition',
    `${download ? 'attachment' : 'inline'}; filename="${filename}"`,
  );
  if (range === null) {
    void reply.header('Content-Length', size);
    return reply.send(media.asset.createReadStream());
  }
  const headers = contentRangeHeaders(range, size);
  void reply.status(206);
  void reply.header('Content-Range', headers.contentRange);
  void reply.header('Content-Length', headers.contentLength);
  return reply.send(media.asset.createReadStream(range));
};
