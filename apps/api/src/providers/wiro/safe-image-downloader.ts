import { ReferenceImageProviderError } from '../reference-images/reference-image-provider.js';
import {
  type DownloadedRemoteImage,
  isPublicRemoteImageAddress,
  type RemoteImageRequestImplementation,
  type ResolvedRemoteImageAddress,
  SAFE_PROVIDER_IMAGE_DOWNLOAD_POLICY,
  SafeRemoteImageDownloader,
} from '../transport/safe-remote-image-downloader.js';

export const isPublicWiroImageAddress = isPublicRemoteImageAddress;
export type ResolvedWiroImageAddress = {
  readonly address: ResolvedRemoteImageAddress['address'];
  readonly family: ResolvedRemoteImageAddress['family'];
};
export type WiroImageHostnameResolver = (
  hostname: string,
) => Promise<readonly ResolvedWiroImageAddress[]>;
export type WiroHttpsRequestImplementation = RemoteImageRequestImplementation;
export type DownloadedWiroImage = DownloadedRemoteImage;

export class SafeWiroImageDownloader {
  readonly #transport: SafeRemoteImageDownloader;

  constructor(
    options: {
      readonly resolveHostname?: WiroImageHostnameResolver;
      readonly request?: WiroHttpsRequestImplementation;
    } = {},
  ) {
    this.#transport = new SafeRemoteImageDownloader({
      policy: SAFE_PROVIDER_IMAGE_DOWNLOAD_POLICY,
      createError: (reason, errorOptions) =>
        new ReferenceImageProviderError(reason, {
          providerId: 'wiro',
          ...errorOptions,
        }),
      ...options,
    });
  }

  download(url: string, signal: AbortSignal): Promise<DownloadedWiroImage> {
    return this.#transport.download(url, signal);
  }
}
