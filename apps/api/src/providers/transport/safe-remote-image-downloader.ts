import { lookup as resolveDns } from 'node:dns/promises';
import type { IncomingMessage } from 'node:http';
import { request as httpsRequest, type RequestOptions } from 'node:https';
import { BlockList, isIP, type LookupFunction } from 'node:net';
import { IMAGE_MIME_TYPES } from '@studio/domain';
import {
  MAX_PROVIDER_IMAGE_BYTES,
  type ReferenceImageMimeType,
} from '../reference-images/reference-image-provider.js';

const blockedAddresses = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  blockedAddresses.addSubnet(network, prefix, 'ipv4');
}
for (const [network, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['64:ff9b::', 96],
  ['100::', 64],
  ['2001:db8::', 32],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  blockedAddresses.addSubnet(network, prefix, 'ipv6');
}

const normalizedHostname = (hostname: string): string =>
  hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;

export const isPublicRemoteImageAddress = (address: string): boolean => {
  const mappedIpv4 = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/iu.exec(address)?.[1];
  if (mappedIpv4 !== undefined) return isPublicRemoteImageAddress(mappedIpv4);
  const family = isIP(address);
  if (family === 4) return !blockedAddresses.check(address, 'ipv4');
  if (family === 6) return !blockedAddresses.check(address, 'ipv6');
  return false;
};

export interface ResolvedRemoteImageAddress {
  readonly address: string;
  readonly family: 4 | 6;
}

export type RemoteImageHostnameResolver = (
  hostname: string,
) => Promise<readonly ResolvedRemoteImageAddress[]>;

export type RemoteImageRequestImplementation = (
  url: URL,
  options: RequestOptions,
  callback: (response: IncomingMessage) => void,
) => ReturnType<typeof httpsRequest>;

export interface SafeRemoteImageDownloadPolicy {
  readonly maxRedirects: number;
  readonly maxBytes: number;
  readonly acceptedMimeTypes: readonly ReferenceImageMimeType[];
}

export const SAFE_PROVIDER_IMAGE_DOWNLOAD_POLICY = {
  maxRedirects: 3,
  maxBytes: MAX_PROVIDER_IMAGE_BYTES,
  acceptedMimeTypes: IMAGE_MIME_TYPES,
} as const satisfies SafeRemoteImageDownloadPolicy;

export interface RemoteImageDownloadErrorOptions {
  readonly upstreamStatus?: number;
  readonly cause?: unknown;
}

export type RemoteImageDownloadErrorFactory = (
  reason: 'failure' | 'invalid-response',
  options?: RemoteImageDownloadErrorOptions,
) => Error;

export interface DownloadedRemoteImage {
  readonly bytes: Buffer;
  readonly mimeType: ReferenceImageMimeType;
}

const defaultResolver: RemoteImageHostnameResolver = async (hostname) => {
  const addresses = await resolveDns(hostname, { all: true, verbatim: true });
  return addresses.flatMap((entry) =>
    entry.family === 4 || entry.family === 6
      ? [{ address: entry.address, family: entry.family }]
      : [],
  );
};

const firstHeaderValue = (value: string | readonly string[] | undefined): string | undefined =>
  typeof value === 'string' ? value : value?.[0];

const mimeTypeFromHeader = (
  value: string | undefined,
  acceptedMimeTypes: readonly ReferenceImageMimeType[],
): ReferenceImageMimeType | null => {
  const normalized = value?.split(';', 1)[0]?.trim().toLowerCase();
  return acceptedMimeTypes.find((mimeType) => mimeType === normalized) ?? null;
};

export class SafeRemoteImageDownloader {
  readonly #policy: SafeRemoteImageDownloadPolicy;
  readonly #resolveHostname: RemoteImageHostnameResolver;
  readonly #request: RemoteImageRequestImplementation;
  readonly #createError: RemoteImageDownloadErrorFactory;

  constructor(options: {
    readonly policy: SafeRemoteImageDownloadPolicy;
    readonly createError: RemoteImageDownloadErrorFactory;
    readonly resolveHostname?: RemoteImageHostnameResolver;
    readonly request?: RemoteImageRequestImplementation;
  }) {
    this.#policy = options.policy;
    this.#createError = options.createError;
    this.#resolveHostname = options.resolveHostname ?? defaultResolver;
    this.#request = options.request ?? httpsRequest;
  }

  download(url: string, signal: AbortSignal): Promise<DownloadedRemoteImage> {
    return this.#download(new URL(url), signal, 0);
  }

  async #download(
    url: URL,
    signal: AbortSignal,
    redirectCount: number,
  ): Promise<DownloadedRemoteImage> {
    if (
      url.protocol !== 'https:' ||
      url.username !== '' ||
      url.password !== '' ||
      url.hash !== ''
    ) {
      throw this.#createError('invalid-response');
    }
    if (redirectCount > this.#policy.maxRedirects) {
      throw this.#createError('invalid-response');
    }

    const hostname = normalizedHostname(url.hostname);
    const literalFamily = isIP(hostname);
    const addresses =
      literalFamily === 4 || literalFamily === 6
        ? [{ address: hostname, family: literalFamily }]
        : await this.#resolveHostname(hostname);
    const [selected] = addresses;
    if (
      selected === undefined ||
      addresses.some((entry) => !isPublicRemoteImageAddress(entry.address))
    ) {
      throw this.#createError('invalid-response');
    }

    const pinnedLookup: LookupFunction = (_hostname, options, callback) => {
      if (options.all === true) {
        callback(null, [...addresses]);
        return;
      }
      callback(null, selected.address, selected.family);
    };

    return new Promise<DownloadedRemoteImage>((resolve, reject) => {
      const request = this.#request(
        url,
        {
          method: 'GET',
          headers: { Accept: this.#policy.acceptedMimeTypes.join(', ') },
          lookup: pinnedLookup,
          signal,
        },
        (response) => {
          const status = response.statusCode ?? 0;
          const location = response.headers.location;
          if (status >= 300 && status < 400 && location !== undefined) {
            response.resume();
            let next: URL;
            try {
              next = new URL(location, url);
            } catch (error) {
              reject(this.#createError('invalid-response', { cause: error }));
              return;
            }
            this.#download(next, signal, redirectCount + 1).then(resolve, reject);
            return;
          }
          if (status < 200 || status >= 300) {
            response.resume();
            reject(this.#createError('failure', { upstreamStatus: status }));
            return;
          }

          const mimeType = mimeTypeFromHeader(
            firstHeaderValue(response.headers['content-type']),
            this.#policy.acceptedMimeTypes,
          );
          if (mimeType === null) {
            response.resume();
            reject(this.#createError('invalid-response'));
            return;
          }
          const declaredLength = Number(response.headers['content-length']);
          if (
            Number.isFinite(declaredLength) &&
            (declaredLength <= 0 || declaredLength > this.#policy.maxBytes)
          ) {
            response.resume();
            reject(this.#createError('invalid-response'));
            return;
          }

          const chunks: Buffer[] = [];
          let byteLength = 0;
          response.on('data', (chunk: Buffer | string) => {
            const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            byteLength += bytes.byteLength;
            if (byteLength > this.#policy.maxBytes) {
              response.destroy(this.#createError('invalid-response'));
              return;
            }
            chunks.push(bytes);
          });
          response.once('error', reject);
          response.once('end', () => {
            if (byteLength === 0) {
              reject(this.#createError('invalid-response'));
              return;
            }
            resolve({ bytes: Buffer.concat(chunks, byteLength), mimeType });
          });
        },
      );
      request.once('error', reject);
      request.end();
    });
  }
}
