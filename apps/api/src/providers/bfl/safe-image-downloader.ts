import { ReferenceImageProviderError } from '../reference-images/reference-image-provider.js';
import {
  type DownloadedRemoteImage,
  isPublicRemoteImageAddress,
  type RemoteImageRequestImplementation,
  type ResolvedRemoteImageAddress,
  SAFE_PROVIDER_IMAGE_DOWNLOAD_POLICY,
  SafeRemoteImageDownloader,
} from '../transport/safe-remote-image-downloader.js';

export const isPublicImageAddress = isPublicRemoteImageAddress;
export type ResolvedImageAddress = {
  readonly address: ResolvedRemoteImageAddress['address'];
  readonly family: ResolvedRemoteImageAddress['family'];
};
export type ImageHostnameResolver = (hostname: string) => Promise<readonly ResolvedImageAddress[]>;
export type HttpsRequestImplementation = RemoteImageRequestImplementation;
export type DownloadedProviderImage = DownloadedRemoteImage;

export class SafeBflImageDownloader {
  readonly #transport: SafeRemoteImageDownloader;

  constructor(
    options: {
      readonly resolveHostname?: ImageHostnameResolver;
      readonly request?: HttpsRequestImplementation;
    } = {},
  ) {
    this.#transport = new SafeRemoteImageDownloader({
      policy: SAFE_PROVIDER_IMAGE_DOWNLOAD_POLICY,
      createError: (reason, errorOptions) =>
        new ReferenceImageProviderError(reason, {
          providerId: 'bfl',
          ...errorOptions,
        }),
      ...options,
    });
  }

  download(url: string, signal: AbortSignal): Promise<DownloadedProviderImage> {
    return this.#transport.download(url, signal);
  }
}
