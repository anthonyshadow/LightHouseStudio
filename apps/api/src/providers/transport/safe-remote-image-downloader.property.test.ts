import { it } from '@fast-check/vitest';
import fc from 'fast-check';
import { expect, vi } from 'vitest';
import {
  isPublicRemoteImageAddress,
  SafeRemoteImageDownloader,
} from './safe-remote-image-downloader.js';

const octet = fc.integer({ min: 0, max: 255 });
const privateIpv4 = fc.oneof(
  fc.tuple(fc.constant(10), octet, octet, octet),
  fc.tuple(fc.constant(127), octet, octet, octet),
  fc.tuple(fc.constant(169), fc.constant(254), octet, octet),
  fc.tuple(fc.constant(172), fc.integer({ min: 16, max: 31 }), octet, octet),
  fc.tuple(fc.constant(192), fc.constant(168), octet, octet),
  fc.tuple(fc.constant(198), fc.integer({ min: 18, max: 19 }), octet, octet),
);

const privateIpv4Text = privateIpv4.map((parts) => parts.join('.'));
const hexSegment = fc.integer({ min: 0, max: 0xffff }).map((value) => value.toString(16));
const blockedIpv6 = fc.oneof(
  fc
    .tuple(fc.integer({ min: 0xfc00, max: 0xfdff }), hexSegment, hexSegment)
    .map(([prefix, second, third]) => `${prefix.toString(16)}:${second}:${third}::1`),
  fc
    .tuple(fc.integer({ min: 0xfe80, max: 0xfebf }), hexSegment)
    .map(([prefix, second]) => `${prefix.toString(16)}:${second}::1`),
  fc
    .tuple(fc.integer({ min: 0xff00, max: 0xffff }), hexSegment)
    .map(([prefix, second]) => `${prefix.toString(16)}:${second}::1`),
  fc.tuple(hexSegment, hexSegment).map(([third, fourth]) => `2001:db8:${third}:${fourth}::1`),
);

it.prop([privateIpv4Text], { seed: 0x49505634, numRuns: 100 })(
  'rejects private IPv4 addresses and every IPv4-mapped spelling of them',
  (address) => {
    expect(isPublicRemoteImageAddress(address)).toBe(false);
    expect(isPublicRemoteImageAddress(`::ffff:${address}`)).toBe(false);
    expect(isPublicRemoteImageAddress(`::FFFF:${address}`)).toBe(false);
  },
);

it.prop([blockedIpv6], { seed: 0x49505636, numRuns: 100 })(
  'rejects generated unique-local, link-local, multicast, and documentation IPv6 addresses',
  (address) => {
    expect(isPublicRemoteImageAddress(address)).toBe(false);
  },
);

it.prop([fc.constantFrom('http', 'credentials', 'fragment'), fc.string({ maxLength: 40 })], {
  seed: 0x55524c53,
  numRuns: 100,
})(
  'rejects unsafe URL features before DNS resolution or an outbound request',
  async (unsafeFeature, generatedValue) => {
    const resolveHostname = vi.fn().mockResolvedValue([{ address: '8.8.8.8', family: 4 }]);
    const request = vi.fn();
    const downloader = new SafeRemoteImageDownloader({
      policy: {
        maxRedirects: 2,
        maxBytes: 16,
        acceptedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
      },
      createError: (reason) => new Error(`safe:${reason}`),
      resolveHostname,
      request,
    });
    const url = new URL('https://images.example.test/asset.jpg');
    if (unsafeFeature === 'http') url.protocol = 'http:';
    if (unsafeFeature === 'credentials') url.username = generatedValue || 'user';
    if (unsafeFeature === 'fragment') url.hash = generatedValue || 'fragment';

    await expect(downloader.download(url.href, new AbortController().signal)).rejects.toThrow(
      'safe:invalid-response',
    );
    expect(resolveHostname).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  },
);
