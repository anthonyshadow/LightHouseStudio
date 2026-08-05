import { ReferenceImageProviderError } from '../reference-images/reference-image-provider.js';
import {
  type DownloadedRemoteImage,
  type RemoteImageHostnameResolver,
  type RemoteImageRequestImplementation,
  SAFE_PROVIDER_IMAGE_DOWNLOAD_POLICY,
  SafeRemoteImageDownloader,
} from '../transport/safe-remote-image-downloader.js';

export class SafeBflImageDownloader {
  readonly #transport: SafeRemoteImageDownloader;

  constructor(
    options: {
      readonly resolveHostname?: RemoteImageHostnameResolver;
      readonly request?: RemoteImageRequestImplementation;
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

  download(url: string, signal: AbortSignal): Promise<DownloadedRemoteImage> {
    return this.#transport.download(url, signal);
  }
}
