import type { HttpReply, HttpRequest } from '../../application/application-runtime.js';
import { AppError } from '../../http/app-error.js';
import { requestHeader } from '../../http/request-helpers.js';
import type { AssetReadHandle } from '../../storage/asset-byte-store.js';

export interface ByteRange {
  readonly start: number;
  readonly end: number;
}

export const parseByteRange = (value: string | undefined, size: number): ByteRange | null => {
  if (value === undefined) return null;
  const match = /^bytes=(\d+)-(\d*)$/u.exec(value);
  if (match === null) throw new AppError(416, 'validation_error', 'Use a valid byte range.');
  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : size - 1;
  const end = Math.min(requestedEnd, size - 1);
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    start > end ||
    start >= size
  ) {
    throw new AppError(416, 'validation_error', 'The requested byte range is unavailable.');
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
  const range = parseByteRange(requestHeader(request, 'range'), size);
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
