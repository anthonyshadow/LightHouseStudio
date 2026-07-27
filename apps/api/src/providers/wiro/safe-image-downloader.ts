import { lookup as resolveDns } from 'node:dns/promises';
import type { IncomingMessage } from 'node:http';
import { request as httpsRequest, type RequestOptions } from 'node:https';
import { BlockList, isIP, type LookupFunction } from 'node:net';
import {
  MAX_PROVIDER_IMAGE_BYTES,
  ReferenceImageProviderError,
  type ReferenceImageMimeType,
} from '../reference-images/reference-image-provider.js';

const MAX_REDIRECTS = 3;

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

export const isPublicWiroImageAddress = (address: string): boolean => {
  const mappedIpv4 = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/iu.exec(address)?.[1];
  if (mappedIpv4 !== undefined) return isPublicWiroImageAddress(mappedIpv4);
  const family = isIP(address);
  if (family === 4) return !blockedAddresses.check(address, 'ipv4');
  if (family === 6) return !blockedAddresses.check(address, 'ipv6');
  return false;
};

export interface ResolvedWiroImageAddress {
  readonly address: string;
  readonly family: 4 | 6;
}

export type WiroImageHostnameResolver = (
  hostname: string,
) => Promise<readonly ResolvedWiroImageAddress[]>;
export type WiroHttpsRequestImplementation = (
  url: URL,
  options: RequestOptions,
  callback: (response: IncomingMessage) => void,
) => ReturnType<typeof httpsRequest>;

const defaultResolver: WiroImageHostnameResolver = async (hostname) => {
  const addresses = await resolveDns(hostname, { all: true, verbatim: true });
  return addresses.flatMap((entry) =>
    entry.family === 4 || entry.family === 6
      ? [{ address: entry.address, family: entry.family }]
      : [],
  );
};

const mimeTypeFromHeader = (value: string | undefined): ReferenceImageMimeType | null => {
  const normalized = value?.split(';', 1)[0]?.trim().toLowerCase();
  if (normalized === 'image/jpeg' || normalized === 'image/png' || normalized === 'image/webp') {
    return normalized;
  }
  return null;
};

const firstHeaderValue = (value: string | readonly string[] | undefined): string | undefined =>
  typeof value === 'string' ? value : value?.[0];

const providerError = (
  reason: ConstructorParameters<typeof ReferenceImageProviderError>[0],
  options: Omit<
    NonNullable<ConstructorParameters<typeof ReferenceImageProviderError>[1]>,
    'providerId'
  > = {},
): ReferenceImageProviderError =>
  new ReferenceImageProviderError(reason, { providerId: 'wiro', ...options });

export interface DownloadedWiroImage {
  readonly bytes: Buffer;
  readonly mimeType: ReferenceImageMimeType;
}

export class SafeWiroImageDownloader {
  readonly #resolveHostname: WiroImageHostnameResolver;
  readonly #request: WiroHttpsRequestImplementation;

  constructor(
    options: {
      readonly resolveHostname?: WiroImageHostnameResolver;
      readonly request?: WiroHttpsRequestImplementation;
    } = {},
  ) {
    this.#resolveHostname = options.resolveHostname ?? defaultResolver;
    this.#request = options.request ?? httpsRequest;
  }

  download(url: string, signal: AbortSignal): Promise<DownloadedWiroImage> {
    return this.#download(new URL(url), signal, 0);
  }

  async #download(
    url: URL,
    signal: AbortSignal,
    redirectCount: number,
  ): Promise<DownloadedWiroImage> {
    if (
      url.protocol !== 'https:' ||
      url.username !== '' ||
      url.password !== '' ||
      url.hash !== ''
    ) {
      throw providerError('invalid-response');
    }
    if (redirectCount > MAX_REDIRECTS) throw providerError('invalid-response');

    const hostname = normalizedHostname(url.hostname);
    const literalFamily = isIP(hostname);
    const addresses =
      literalFamily === 4 || literalFamily === 6
        ? [{ address: hostname, family: literalFamily }]
        : await this.#resolveHostname(hostname);
    const [selected] = addresses;
    if (
      selected === undefined ||
      addresses.some((entry) => !isPublicWiroImageAddress(entry.address))
    ) {
      throw providerError('invalid-response');
    }

    const pinnedLookup: LookupFunction = (_hostname, options, callback) => {
      if (options.all === true) {
        callback(null, [...addresses]);
        return;
      }
      callback(null, selected.address, selected.family);
    };

    return new Promise<DownloadedWiroImage>((resolve, reject) => {
      const request = this.#request(
        url,
        {
          method: 'GET',
          headers: { Accept: 'image/jpeg, image/png, image/webp' },
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
              reject(providerError('invalid-response', { cause: error }));
              return;
            }
            this.#download(next, signal, redirectCount + 1).then(resolve, reject);
            return;
          }
          if (status < 200 || status >= 300) {
            response.resume();
            reject(providerError('failure', { upstreamStatus: status }));
            return;
          }

          const mimeType = mimeTypeFromHeader(firstHeaderValue(response.headers['content-type']));
          if (mimeType === null) {
            response.resume();
            reject(providerError('invalid-response'));
            return;
          }
          const declaredLength = Number(response.headers['content-length']);
          if (
            Number.isFinite(declaredLength) &&
            (declaredLength <= 0 || declaredLength > MAX_PROVIDER_IMAGE_BYTES)
          ) {
            response.resume();
            reject(providerError('invalid-response'));
            return;
          }

          const chunks: Buffer[] = [];
          let byteLength = 0;
          response.on('data', (chunk: Buffer | string) => {
            const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            byteLength += bytes.byteLength;
            if (byteLength > MAX_PROVIDER_IMAGE_BYTES) {
              response.destroy(providerError('invalid-response'));
              return;
            }
            chunks.push(bytes);
          });
          response.once('error', reject);
          response.once('end', () => {
            if (byteLength === 0) {
              reject(providerError('invalid-response'));
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
