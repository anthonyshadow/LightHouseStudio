// @vitest-environment jsdom

import {
  projectSourceUploadMetadataSchema,
  type ProjectCurrentResponse,
  type ProjectSourceResponse,
} from '@studio/contracts';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * What the media runtime says it found, one entry per inspection, in order — so a case states
 * "a QuickTime HEVC on the way in, then the MP4 the conversion produced" and the intake under test
 * makes its own decision about each. The bytes are stubbed; the decision is not.
 */
const media = vi.hoisted(() => ({
  found: [] as { readonly container: 'mp4' | 'quicktime'; readonly codec: string }[],
  inspections: 0,
  /** Whether the inspected file has a sound track at all, and so anything to mux out of it. */
  audio: false,
  /** How many standalone audio sidecars the intake muxed while the case ran. */
  sidecarMuxes: 0,
}));

const HEVC_DECODER_CONFIG = { codec: 'hvc1.1.6.L93.B0', codedWidth: 1_080, codedHeight: 1_920 };

vi.mock('mediabunny', () => {
  const MP4 = Symbol('mp4');
  const QTFF = Symbol('qtff');
  const found = () => media.found[Math.min(media.inspections, media.found.length - 1)]!;
  return {
    ALL_FORMATS: [],
    MP4,
    QTFF,
    WEBM: Symbol('webm'),
    BlobSource: class {},
    Input: class {
      dispose = vi.fn();
      canRead = () => Promise.resolve(true);
      getFormat = () => Promise.resolve(found().container === 'mp4' ? MP4 : QTFF);
      getPrimaryVideoTrack = () => {
        const { codec } = found();
        media.inspections += 1;
        return Promise.resolve({
          getCodec: () => Promise.resolve(codec),
          getDisplayWidth: () => Promise.resolve(1_080),
          getDisplayHeight: () => Promise.resolve(1_920),
          getDecoderConfig: () => Promise.resolve(HEVC_DECODER_CONFIG),
        });
      };
      getPrimaryAudioTrack = () =>
        Promise.resolve(
          media.audio
            ? {
                getCodec: () => Promise.resolve('aac'),
                getDecoderConfig: () => Promise.resolve({ codec: 'mp4a.40.2' }),
              }
            : null,
        );
      getDurationFromMetadata = () => Promise.resolve(4);
      computeDuration = () => Promise.resolve(4);
    },
    /*
     * The muxing half, stubbed well enough to succeed rather than only to exist: an extraction that
     * threw would be swallowed as "the audio could not be preserved" and count as nothing, so a
     * case asserting no sidecar was made would pass whether or not one was attempted. Constructing
     * the output is the first thing an extraction does once it has found a track.
     */
    BufferTarget: class {
      buffer = new ArrayBuffer(8);
    },
    Output: class {
      constructor() {
        media.sidecarMuxes += 1;
      }
      addAudioTrack = () => undefined;
      start = () => Promise.resolve();
      getMimeType = () => Promise.resolve('audio/mp4');
      finalize = () => Promise.resolve();
    },
    EncodedAudioPacketSource: class {
      add = () => Promise.resolve();
      close = () => undefined;
    },
    EncodedPacketSink: class {
      // `for await` accepts a plain iterable, so no packets is an empty array.
      packets = () => [];
    },
    Mp4OutputFormat: class {},
    WebMOutputFormat: class {},
  };
});

const transcode = vi.hoisted(() => ({ transcodeRecordingToMp4: vi.fn() }));
vi.mock('../../adapters/media-processing/transcodeRecording', () => transcode);

import { resetVideoDecodeSupportForTests } from '../../adapters/media-processing/videoDecodeSupport';
import { RemoteStateTestProvider } from '../../test/RemoteStateTestProvider';
import { mockApiServer } from '../../test/msw/server';
import { StudioDesignProvider } from '../../ui';
import { detachedSourceRuntime, ProjectSourceSection } from './ProjectSourceSection';
import type { ProjectSourceActivity } from './useProjectSourceController';

const ids = {
  project: '18b120ac-1578-46e3-8c3d-42307772f391',
  revision: '89a972fe-bfb5-4214-94f7-4bd54f12ce06',
  acceptedRevision: '730c73ca-a6af-4509-83c0-b3c18c1ee81a',
  sourceAsset: '79b94c02-d268-4201-a05b-1f3baa0caed1',
};
const now = '2026-09-04T09:00:00.000Z';

const current = (): ProjectCurrentResponse => ({
  project: {
    id: ids.project,
    campaignId: null,
    title: 'Phone-shot cut',
    status: 'draft',
    version: 1,
    currentRevisionId: ids.revision,
    currentRevisionNumber: 1,
    archivedAt: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  },
  revision: {
    id: ids.revision,
    projectId: ids.project,
    revisionNumber: 1,
    parentRevisionId: null,
    parentRevisionNumber: null,
    snapshot: {
      schemaVersion: 2,
      sourceAssetId: null,
      workingMedia: null,
      presentedMedia: null,
      selectedCharacter: null,
      selectedOutfit: null,
      selectedVoice: null,
      visualTreatment: { kind: 'none' },
      liveMode: null,
      creativeIntent: {
        promptId: null,
        promptLabel: null,
        recipeId: null,
        recipeLabel: null,
        userIntent: '',
        appliedPrompt: null,
        referenceAssetId: null,
        resourceRevision: null,
      },
      localEdit: null,
      exportSpecification: null,
      lastSuccessfulOutput: null,
      workflowPhase: 'source',
      createdAt: now,
      updatedAt: now,
    },
    authorKind: 'user',
    source: 'user-edit',
    createdAt: now,
  },
});

/** What the server answers with once it has accepted the bytes the picker sent. */
const acceptedSource = (filename: string): ProjectSourceResponse => {
  const base = current();
  const reference = { kind: 'asset' as const, assetId: ids.sourceAsset };
  return {
    project: {
      ...base.project,
      status: 'ready',
      version: 2,
      currentRevisionId: ids.acceptedRevision,
      currentRevisionNumber: 2,
    },
    revision: {
      ...base.revision,
      id: ids.acceptedRevision,
      revisionNumber: 2,
      parentRevisionId: ids.revision,
      parentRevisionNumber: 1,
      snapshot: {
        ...base.revision.snapshot,
        sourceAssetId: ids.sourceAsset,
        workingMedia: reference,
        presentedMedia: reference,
        workflowPhase: 'creative',
      },
    },
    source: {
      kind: 'uploaded',
      savedVideoId: null,
      videoVersionId: null,
      mimeType: 'video/mp4',
      filename,
      sizeBytes: 48,
      container: 'mp4',
      videoCodec: 'avc',
      audioCodec: null,
      durationMs: 4_000,
      width: 1_080,
      height: 1_920,
      hasAudio: false,
      acceptedAt: now,
      contentUrl: `/api/projects/${ids.project}/source/content`,
    },
  };
};

interface CapturedUpload {
  readonly filename: string;
  readonly kind: 'uploaded' | 'recorded';
  readonly contentType: string;
  readonly idempotencyKey: string;
}

/**
 * Records which file reached the source route, read through the contract the client writes.
 *
 * Its name and type are what identify it: a File body does not survive jsdom's fetch — it arrives
 * as the string "undefined" — so the byte count here would say nothing about what was sent. The
 * conversion renames and retypes the file it produces, and nothing else in this path does.
 */
const installSourceRoute = (uploads: CapturedUpload[]) => {
  mockApiServer.use(
    http.post(`*/api/projects/${ids.project}/source`, ({ request }) => {
      const descriptor = projectSourceUploadMetadataSchema.parse(
        JSON.parse(decodeURIComponent(request.headers.get('x-lightframe-project-source') ?? '{}')),
      );
      uploads.push({
        filename: descriptor.filename,
        kind: descriptor.kind,
        contentType: request.headers.get('content-type') ?? '',
        idempotencyKey: request.headers.get('idempotency-key') ?? '',
      });
      return HttpResponse.json(acceptedSource(descriptor.filename), { status: 201 });
    }),
  );
};

/**
 * jsdom has no media pipeline, so a `<video>` never reports metadata and the intake's playability
 * check would wait forever. This makes the element answer the one question that check asks.
 */
const installPlayableVideoElement = () => {
  vi.spyOn(window.URL, 'createObjectURL').mockReturnValue('blob:project-source');
  vi.spyOn(window.URL, 'revokeObjectURL').mockImplementation(() => undefined);
  // `duration` belongs to the media element; the pixel dimensions belong to the video element.
  Object.defineProperty(HTMLMediaElement.prototype, 'duration', {
    configurable: true,
    get: () => 4,
  });
  for (const [property, value] of [
    ['videoWidth', 1_080],
    ['videoHeight', 1_920],
  ] as const) {
    Object.defineProperty(HTMLVideoElement.prototype, property, {
      configurable: true,
      get: () => value,
    });
  }
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(function (
    this: HTMLMediaElement,
  ) {
    this.dispatchEvent(new Event('loadedmetadata'));
  });
};

const decoderAnswers = (supported: boolean) => {
  vi.stubGlobal('VideoDecoder', {
    isConfigSupported: vi.fn(() => Promise.resolve({ supported, config: HEVC_DECODER_CONFIG })),
  });
};

const renderSection = (activities: ProjectSourceActivity[] = []) =>
  render(
    <StudioDesignProvider>
      <RemoteStateTestProvider>
        <ProjectSourceSection
          current={current()}
          runtime={detachedSourceRuntime}
          onActivityChange={(activity) => activities.push(activity)}
        />
      </RemoteStateTestProvider>
    </StudioDesignProvider>,
  );

const choose = (container: HTMLElement, file: File) => {
  const input = container.querySelector('input[type="file"]');
  expect(input).toBeInstanceOf(HTMLInputElement);
  fireEvent.change(input!, { target: { files: [file] } });
};

const phoneClip = () =>
  new File([new Uint8Array(96)], 'phone-clip.mov', { type: 'video/quicktime' });

/**
 * A conversion this case owns: it keeps the signal the intake handed the transcoder and the resolve
 * that ends it, so a case can cancel the wait and then let the conversion finish anyway.
 */
const pendingConversion = () => {
  const held: {
    signal: AbortSignal | null;
    finish: ((result: { blob: Blob; mimeType: string }) => void) | null;
  } = { signal: null, finish: null };
  transcode.transcodeRecordingToMp4.mockImplementation(
    (_input: Blob, options: { signal: AbortSignal }) => {
      held.signal = options.signal;
      return new Promise<{ blob: Blob; mimeType: string }>((resolve) => {
        held.finish = resolve;
      });
    },
  );
  return held;
};

const convertedMp4 = () => ({
  blob: new Blob([new Uint8Array(48)], { type: 'video/mp4' }),
  mimeType: 'video/mp4',
});

beforeEach(() => {
  media.found = [{ container: 'mp4', codec: 'avc' }];
  media.inspections = 0;
  media.audio = false;
  media.sidecarMuxes = 0;
  transcode.transcodeRecordingToMp4.mockReset();
  resetVideoDecodeSupportForTests();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  resetVideoDecodeSupportForTests();
});

describe('choosing the video a Project works from', () => {
  it('converts a phone clip this browser can decode, and uploads the H.264 that came back', async () => {
    // A QuickTime HEVC on the way in; whatever the conversion produced is inspected next.
    media.found = [
      { container: 'quicktime', codec: 'hevc' },
      { container: 'mp4', codec: 'avc' },
    ];
    decoderAnswers(true);
    installPlayableVideoElement();
    const conversion = pendingConversion();
    const uploads: CapturedUpload[] = [];
    const activities: ProjectSourceActivity[] = [];
    installSourceRoute(uploads);
    const view = renderSection(activities);

    choose(view.container, phoneClip());

    // The wait is explained while it happens, and nothing has been sent yet.
    expect(await screen.findByText(/being converted to H.264/u)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Upload' })).toBeDisabled();
    expect(uploads).toHaveLength(0);
    // A conversion is work the shell must know about: an expiring session or a logout has
    // something to lose here, and something to cancel it with.
    const converting = activities.at(-1);
    expect(converting).toEqual(expect.objectContaining({ busy: true, accepted: false }));
    expect(converting?.abort).toEqual(expect.any(Function));

    await act(() => {
      conversion.finish!(convertedMp4());
      return Promise.resolve();
    });

    expect(await screen.findByRole('heading', { name: 'Original video ready' })).toBeVisible();
    expect(transcode.transcodeRecordingToMp4).toHaveBeenCalledTimes(1);
    // What went up is the MP4 the conversion produced, under the chosen file's own name — not the
    // QuickTime HEVC that was chosen — and it still carries the picker's idempotency key.
    expect(uploads).toHaveLength(1);
    expect(uploads[0]).toMatchObject({
      filename: 'phone-clip.mp4',
      kind: 'uploaded',
      contentType: 'video/mp4',
    });
    expect(uploads[0]?.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/u);
  });

  it('refuses a phone clip this browser cannot decode, says why and what to do, and sends nothing', async () => {
    media.found = [{ container: 'quicktime', codec: 'hevc' }];
    decoderAnswers(false);
    const uploads: CapturedUpload[] = [];
    installSourceRoute(uploads);
    const view = renderSection();

    choose(view.container, phoneClip());

    const refusal = await screen.findByRole('alert');
    // Both facts, because either alone leaves the operator without a next step: what this product
    // publishes, and that this browser cannot get them there from here.
    expect(refusal).toHaveTextContent('HEVC and ProRes are not qualified');
    expect(refusal).toHaveTextContent(
      'This browser cannot convert it either — convert it to H.264 MP4 and choose it again.',
    );
    expect(transcode.transcodeRecordingToMp4).not.toHaveBeenCalled();
    expect(uploads).toHaveLength(0);
    // A refusal is not a dead end: the Project still has no source, and the picker is live.
    expect(screen.getByRole('heading', { name: 'No original video yet' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Upload' })).toBeEnabled();
  });

  it('uploads a video with sound without muxing an audio sidecar it would throw away', async () => {
    media.audio = true;
    installPlayableVideoElement();
    const uploads: CapturedUpload[] = [];
    installSourceRoute(uploads);
    const view = renderSection();

    choose(
      view.container,
      new File([new Uint8Array(96)], 'talking-head.mp4', { type: 'video/mp4' }),
    );

    expect(await screen.findByRole('heading', { name: 'Original video ready' })).toBeVisible();
    await waitFor(() => expect(uploads).toHaveLength(1));
    /*
     * The picker reads one field of the inspection — the file — because the bytes go to the server
     * and the server inspects them itself. Muxing the audio out again here would walk every packet
     * and hold a copy of the whole track beside the video it came from, on the path this product's
     * recording memory budget accounts for, to discard it on the next line.
     */
    expect(media.sidecarMuxes).toBe(0);
  });

  it('uploads a video that needs nothing done to it exactly as it was chosen', async () => {
    installPlayableVideoElement();
    const uploads: CapturedUpload[] = [];
    installSourceRoute(uploads);
    const view = renderSection();

    choose(view.container, new File([new Uint8Array(96)], 'ready-cut.mp4', { type: 'video/mp4' }));

    expect(await screen.findByRole('heading', { name: 'Original video ready' })).toBeVisible();
    expect(transcode.transcodeRecordingToMp4).not.toHaveBeenCalled();
    await waitFor(() => expect(uploads).toHaveLength(1));
    expect(uploads[0]).toMatchObject({
      filename: 'ready-cut.mp4',
      kind: 'uploaded',
      contentType: 'video/mp4',
    });
  });
});

/**
 * The three ways a conversion ends without producing a source. Each is the same abort — the one the
 * intake holds — and what matters about all three is the same two facts: the transcoder is actually
 * told, so minutes of device work stop rather than run on for a surface that has moved on, and the
 * result that arrives afterwards is not uploaded to a Project that never asked for it.
 */
describe('abandoning a conversion the picker started', () => {
  const startConversion = async (
    activities: ProjectSourceActivity[],
    uploads: CapturedUpload[],
  ) => {
    // A QuickTime HEVC on the way in; the conversion is held open until the case ends it.
    media.found = [
      { container: 'quicktime', codec: 'hevc' },
      { container: 'mp4', codec: 'avc' },
    ];
    decoderAnswers(true);
    installPlayableVideoElement();
    const conversion = pendingConversion();
    installSourceRoute(uploads);
    const view = renderSection(activities);

    choose(view.container, phoneClip());

    expect(await screen.findByText(/being converted to H.264/u)).toBeVisible();
    return { conversion, view };
  };

  const finishLate = async (conversion: ReturnType<typeof pendingConversion>) => {
    await act(() => {
      conversion.finish!(convertedMp4());
      return Promise.resolve();
    });
  };

  it('stops the conversion when the shell discards pending work, and uploads no late result', async () => {
    const activities: ProjectSourceActivity[] = [];
    const uploads: CapturedUpload[] = [];
    const { conversion } = await startConversion(activities, uploads);

    // What a logout and an expiring session reach for: the shell holds the reported activity, and
    // the abort on it is the intake's own.
    const abort = activities.at(-1)?.abort;
    expect(abort).toEqual(expect.any(Function));
    act(() => {
      abort!();
    });

    expect(conversion.signal?.aborted).toBe(true);
    expect(conversion.signal?.reason).toBe('project-source-intake-cancelled');
    expect(screen.queryByText(/being converted to H.264/u)).toBeNull();

    await finishLate(conversion);

    expect(uploads).toHaveLength(0);
    // Not a refusal either: nothing was wrong with the file, the operator stopped the work.
    expect(screen.getByRole('heading', { name: 'No original video yet' })).toBeVisible();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('takes the conversion with it when the surface goes away, and uploads no late result', async () => {
    const uploads: CapturedUpload[] = [];
    const { conversion, view } = await startConversion([], uploads);

    view.unmount();

    expect(conversion.signal?.aborted).toBe(true);
    expect(conversion.signal?.reason).toBe('project-source-intake-unmounted');

    await finishLate(conversion);

    expect(uploads).toHaveLength(0);
  });

  it('drops the conversion a second chosen file replaces, and uploads only the second', async () => {
    const uploads: CapturedUpload[] = [];
    const { conversion, view } = await startConversion([], uploads);

    choose(view.container, new File([new Uint8Array(96)], 'ready-cut.mp4', { type: 'video/mp4' }));

    expect(await screen.findByRole('heading', { name: 'Original video ready' })).toBeVisible();
    expect(conversion.signal?.reason).toBe('project-source-intake-replaced');

    await finishLate(conversion);

    // The second file, once: the abandoned conversion's own result has nowhere to go.
    await waitFor(() => expect(uploads).toHaveLength(1));
    expect(uploads[0]).toMatchObject({ filename: 'ready-cut.mp4', contentType: 'video/mp4' });
  });
});
