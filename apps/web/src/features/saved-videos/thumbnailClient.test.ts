// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

type SinkOptions = Readonly<{ width?: number; height?: number; fit?: string }>;

const media = vi.hoisted(() => ({
  displayWidth: 1_920,
  displayHeight: 1_080,
  duration: 12,
  sinkOptions: [] as SinkOptions[],
  timestamps: [] as number[],
  sources: [] as { readonly kind: 'blob' | 'url'; readonly url?: string }[],
  disposals: 0,
}));

vi.mock('mediabunny', () => ({
  ALL_FORMATS: [],
  BlobSource: class {
    constructor() {
      media.sources.push({ kind: 'blob' });
    }
  },
  UrlSource: class {
    constructor(url: string) {
      media.sources.push({ kind: 'url', url });
    }
  },
  Input: class {
    disposed = false;
    canRead = () => Promise.resolve(true);
    getPrimaryVideoTrack = () =>
      Promise.resolve({ displayWidth: media.displayWidth, displayHeight: media.displayHeight });
    getDurationFromMetadata = () => Promise.resolve(media.duration);
    dispose = () => {
      this.disposed = true;
      media.disposals += 1;
    };
  },
  CanvasSink: class {
    constructor(_track: unknown, options: SinkOptions) {
      media.sinkOptions.push(options);
    }
    getCanvas(timestamp: number) {
      media.timestamps.push(timestamp);
      return Promise.resolve({
        canvas: {
          convertToBlob: () => Promise.resolve(new Blob(['poster'], { type: 'image/webp' })),
        },
      });
    }
  },
}));

import { createSavedVideoThumbnail } from './thumbnailClient';

const video = () => ({ kind: 'blob', blob: new Blob(['video'], { type: 'video/mp4' }) }) as const;

describe('createSavedVideoThumbnail', () => {
  beforeEach(() => {
    media.displayWidth = 1_920;
    media.displayHeight = 1_080;
    media.duration = 12;
    media.sinkOptions.length = 0;
    media.timestamps.length = 0;
    media.sources.length = 0;
    media.disposals = 0;
  });

  it('bounds the long edge and lets the other edge follow the source aspect ratio', async () => {
    await createSavedVideoThumbnail(video(), new AbortController().signal);
    expect(media.sinkOptions[0]).toEqual({ width: 480 });

    media.displayWidth = 1_080;
    media.displayHeight = 1_920;
    await createSavedVideoThumbnail(video(), new AbortController().signal);
    expect(media.sinkOptions[1]).toEqual({ height: 480 });

    media.displayWidth = 720;
    media.displayHeight = 720;
    await createSavedVideoThumbnail(video(), new AbortController().signal);
    expect(media.sinkOptions[2]).toEqual({ width: 480 });
  });

  it('never upscales a source that is already smaller than the bound', async () => {
    media.displayWidth = 320;
    media.displayHeight = 240;
    await createSavedVideoThumbnail(video(), new AbortController().signal);
    expect(media.sinkOptions[0]).toEqual({ width: 320 });
  });

  it('falls back to the bound when the track reports unusable dimensions', async () => {
    media.displayWidth = 0;
    media.displayHeight = 0;
    await createSavedVideoThumbnail(video(), new AbortController().signal);
    expect(media.sinkOptions[0]).toEqual({ width: 480 });
  });

  it('takes an early frame automatically and the opening frame on request', async () => {
    await createSavedVideoThumbnail(video(), new AbortController().signal);
    expect(media.timestamps[0]).toBe(1);

    media.duration = 4;
    await createSavedVideoThumbnail(video(), new AbortController().signal);
    expect(media.timestamps[1]).toBeCloseTo(0.4);

    await createSavedVideoThumbnail(video(), new AbortController().signal, 'first');
    expect(media.timestamps[2]).toBe(0);
  });

  it('range-reads a URL rather than downloading the whole video for one frame', async () => {
    await createSavedVideoThumbnail(
      { kind: 'url', url: '/api/videos/v-1/versions/ver-1/content' },
      new AbortController().signal,
    );
    expect(media.sources).toEqual([{ kind: 'url', url: '/api/videos/v-1/versions/ver-1/content' }]);

    await createSavedVideoThumbnail(video(), new AbortController().signal);
    expect(media.sources[1]).toEqual({ kind: 'blob' });
  });

  it('disposes the input exactly once, whichever way it finishes', async () => {
    await createSavedVideoThumbnail(video(), new AbortController().signal);
    expect(media.disposals).toBe(1);
  });

  it('refuses to start once the signal is aborted', async () => {
    const controller = new AbortController();
    controller.abort('cancelled');
    await expect(createSavedVideoThumbnail(video(), controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(media.sinkOptions).toHaveLength(0);
  });
});
