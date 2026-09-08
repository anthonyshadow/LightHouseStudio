// @vitest-environment jsdom

import { Blob as PlatformBlob } from 'node:buffer';
import {
  completeDirectSavedVideoUploadRequestSchema,
  createDirectSavedVideoUploadRequestSchema,
  type SavedVideoDetail,
} from '@studio/contracts';
import { http, HttpResponse, type PathParams } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApiServer } from '../../test/msw/server';
import { saveVideoDirect } from './savedVideosApi';

/**
 * The resume, joined at the parts the client puts on the wire.
 *
 * Nothing is substituted on this side of the boundary: the real `@uppy/core` and `@uppy/aws-s3`
 * chunk the blob, decide what to send and PUT it. Only the far side is a fake — an object store
 * that keeps what it is given and lists it back, and an API that replays a staged upload for an
 * idempotency key it has seen before.
 *
 * So one thing is shown here, and it is worth stating narrowly: after an interrupted attempt the
 * client stops sending the parts the server says it already holds. It does not show that the
 * network carried less, because no body leaves this process, and it measures no time saved. R2's
 * own promises are assumed rather than tested — that ListParts answers with what UploadPart
 * stored, that a re-PUT under one part number replaces rather than duplicates, and that a staged
 * upload outlives the gap. Those need R2, and `persistence-factory` reaches direct uploads only
 * when the asset store is R2.
 */

/** The adapter fixes an 8 MB chunk, so 20 MB is three parts: 8 MB, 8 MB, and a 4 MB tail. */
const PART_SIZE_BYTES = 8 * 1024 * 1024;
const UPLOAD_BYTES = 20 * 1024 * 1024;
const TAIL_PART_NUMBER = 3;
const TAIL_PART_BYTES = UPLOAD_BYTES - 2 * PART_SIZE_BYTES;

/** Where the API's signed part URLs point. Cross-origin, as a real bucket is. */
const OBJECT_STORE_ORIGIN = 'https://signed.r2.test';
/** Two, so an attempt that staged under a second idempotency key would land on an empty upload. */
const STAGED_UPLOAD_IDS = [
  '1a0a22d4-00f7-4c64-88fd-196c97589c8f',
  'f0b1e4c8-6d3a-4a1f-9c07-1f2f5d9a4b31',
] as const;

const videoId = 'c26b5280-1538-44cd-82db-a6b1356acf62';
const versionId = '2efcc6c3-e82c-419a-8807-c0026170fb75';
const savedVideo: SavedVideoDetail = {
  id: videoId,
  title: 'Direct take',
  status: 'ready',
  currentVersion: {
    id: versionId,
    videoId,
    ordinal: 1,
    origin: 'recorded',
    characterName: null,
    characterVariantName: null,
    sourceVersionId: null,
    mimeType: 'video/mp4',
    filename: 'direct-take.mp4',
    sizeBytes: UPLOAD_BYTES,
    durationMs: 12_000,
    width: 1_280,
    height: 720,
    exportSpecification: null,
    variantSetId: null,
    createdAt: '2026-08-09T14:00:00.000Z',
  },
  sourceVideoId: null,
  versionCount: 1,
  thumbnailAvailable: false,
  revision: 1,
  createdAt: '2026-08-09T14:00:00.000Z',
  updatedAt: '2026-08-09T14:00:00.000Z',
  versions: [],
};
savedVideo.versions.push(savedVideo.currentVersion);

/**
 * The bytes, marked by part.
 *
 * Every byte carries the number of the part it belongs to, so a resumed attempt that re-sent the
 * head under the tail's number — or resumed at the wrong offset — would be caught by the body
 * rather than only by the part number it claimed.
 */
const markedUploadBody = (): Blob => {
  const bytes = new Uint8Array(UPLOAD_BYTES);
  bytes.fill(1, 0, PART_SIZE_BYTES);
  bytes.fill(2, PART_SIZE_BYTES, 2 * PART_SIZE_BYTES);
  bytes.fill(TAIL_PART_NUMBER, 2 * PART_SIZE_BYTES);
  return new Blob([bytes], { type: 'video/mp4' });
};

const saveInput = (blob: Blob) => ({
  blob,
  title: 'Direct take',
  filename: 'direct-take.mp4',
  origin: 'recorded' as const,
  idempotencyKey: '9bb2885e-31d7-4487-b722-c78ef43ed230',
});

type SentPart = Readonly<{
  attempt: number;
  uploadId: string;
  partNumber: number;
  sizeBytes: number;
  marker: number;
}>;
type HeldPart = Readonly<{ sizeBytes: number; etag: string }>;
type ClaimedPart = Readonly<{ PartNumber: number; ETag: string }>;
type Deferred = Readonly<{ promise: Promise<void>; settle: () => void }>;

const deferred = (): Deferred => {
  let settle = (): void => {};
  const promise = new Promise<void>((resolve) => {
    settle = () => {
      resolve();
    };
  });
  return { promise, settle };
};

const routeParam = (params: PathParams, name: string): string => {
  const value = params[name];
  if (typeof value !== 'string') throw new Error(`The mock object store expected a ${name}.`);
  return value;
};

const invalidRequest = (message: string): Response =>
  HttpResponse.json({ error: { code: 'invalid_request', message } }, { status: 400 });

describe('direct saved-video upload resumed after an interrupted attempt', () => {
  /** Which delivery attempt the fakes are serving, so every PUT can be attributed to one. */
  let attempt = 1;
  let sent: SentPart[] = [];
  /** Staged uploads by idempotency key, which is what makes the second attempt a replay. */
  let stagedUploads = new Map<string, string>();
  /** What each staged upload holds, as `ListParts` would answer it. */
  let heldParts = new Map<string, Map<number, HeldPart>>();
  /** The part whose body never lands, and the two ends of that interruption. */
  let severedPart: number | null = null;
  let severedArrival = deferred();
  let severedRelease = deferred();
  /** The parts the completing attempt claimed, with the ETags it claimed them under. */
  let claimedParts: readonly ClaimedPart[] | null = null;

  const partsOf = (uploadId: string): Map<number, HeldPart> => {
    const existing = heldParts.get(uploadId);
    if (existing !== undefined) return existing;
    const created = new Map<number, HeldPart>();
    heldParts.set(uploadId, created);
    return created;
  };

  const sentIn = (delivery: number): readonly SentPart[] =>
    sent.filter((part) => part.attempt === delivery);

  beforeEach(() => {
    /**
     * The upload body has to be a Blob the fetch stack here can actually read. jsdom's has no
     * `stream()`, and the request MSW's XHR interceptor builds from one carries no body at all —
     * every part would arrive empty and the byte counts below would be measuring the environment
     * instead of the uploader. Every browser's Blob streams; this environment's does not, so the
     * runtime's own is put in its place for this file. `vi.unstubAllGlobals` puts it back.
     */
    vi.stubGlobal('Blob', PlatformBlob);
    attempt = 1;
    sent = [];
    stagedUploads = new Map();
    heldParts = new Map();
    severedPart = null;
    severedArrival = deferred();
    severedRelease = deferred();
    claimedParts = null;

    mockApiServer.use(
      http.post('*/api/videos/uploads', async ({ request }) => {
        const body = createDirectSavedVideoUploadRequestSchema.safeParse(await request.json());
        if (!body.success) return invalidRequest('The staging request did not match the contract.');
        // The server's own replay: one staged upload per idempotency key, so an attempt that
        // arrives with a key already seen is handed back the upload whose parts are still there.
        const uploadId =
          stagedUploads.get(body.data.idempotencyKey) ??
          STAGED_UPLOAD_IDS[stagedUploads.size] ??
          STAGED_UPLOAD_IDS[0];
        stagedUploads.set(body.data.idempotencyKey, uploadId);
        return HttpResponse.json({
          uploadId,
          expiresAt: '2026-08-09T15:00:00.000Z',
          result: null,
        });
      }),
      http.get('*/api/videos/uploads/:uploadId/parts', ({ params }) => {
        const parts = [...partsOf(routeParam(params, 'uploadId'))]
          .map(([PartNumber, part]) => ({ PartNumber, Size: part.sizeBytes, ETag: part.etag }))
          .sort((left, right) => left.PartNumber - right.PartNumber);
        return HttpResponse.json({ parts });
      }),
      http.post('*/api/videos/uploads/:uploadId/parts/:partNumber', ({ params }) => {
        const uploadId = routeParam(params, 'uploadId');
        const partNumber = routeParam(params, 'partNumber');
        return HttpResponse.json({
          url: `${OBJECT_STORE_ORIGIN}/${uploadId}/parts/${partNumber}?x-signature=stub`,
          expiresAt: '2026-08-09T14:05:00.000Z',
        });
      }),
      http.put(
        `${OBJECT_STORE_ORIGIN}/:uploadId/parts/:partNumber`,
        async ({ request, params }) => {
          const uploadId = routeParam(params, 'uploadId');
          const partNumber = Number(routeParam(params, 'partNumber'));
          const body = new Uint8Array(await request.arrayBuffer());
          sent.push({
            attempt,
            uploadId,
            partNumber,
            sizeBytes: body.byteLength,
            marker: body[0] ?? 0,
          });
          if (partNumber === severedPart) {
            severedArrival.settle();
            // The page went away with this body in flight: it is never acknowledged and never stored.
            await severedRelease.promise;
            return HttpResponse.error();
          }
          const etag = `"r2-part-${partNumber}"`;
          partsOf(uploadId).set(partNumber, { sizeBytes: body.byteLength, etag });
          // A real bucket has to expose ETag for the uploader to read it at all; the fake says so too
          // rather than relying on an interceptor being more generous than CORS.
          return new HttpResponse(null, {
            status: 200,
            headers: { ETag: etag, 'Access-Control-Expose-Headers': 'ETag' },
          });
        },
      ),
      http.post('*/api/videos/uploads/:uploadId/complete', async ({ request }) => {
        const body = completeDirectSavedVideoUploadRequestSchema.safeParse(await request.json());
        if (!body.success) return invalidRequest('The completion did not match the contract.');
        claimedParts = body.data.parts;
        return HttpResponse.json(savedVideo);
      }),
      // Reached only by the teardown below, which cancels the uploader the reload left behind. A
      // reload itself never sends this, and the staged upload survives precisely because it does not.
      http.delete('*/api/videos/uploads/:uploadId', () => new HttpResponse(null, { status: 204 })),
    );
  });

  it('puts only the part the staged upload does not already hold', async () => {
    severedPart = TAIL_PART_NUMBER;
    /**
     * The reload is modelled by abandoning the attempt, not by aborting it. A reloaded tab runs no
     * React cleanup, so `useSaveVideo` never aborts its controller and the adapter never gets to
     * DELETE the staged upload — which would end the resume rather than enable it. The controller
     * here exists only to tear the abandoned uploader down once the assertions are done.
     */
    const abandoned = new AbortController();
    const interrupted = saveVideoDirect({
      ...saveInput(markedUploadBody()),
      signal: abandoned.signal,
    });
    const stagedUploadId = STAGED_UPLOAD_IDS[0];

    try {
      await vi.waitFor(() => {
        expect(partsOf(stagedUploadId).size).toBe(2);
      });
      await severedArrival.promise;

      // The first attempt put all three parts on the wire, and the tail was still in flight when
      // the page went, so what the staged upload is left holding is the other two.
      expect(
        sentIn(1)
          .map((part) => part.partNumber)
          .sort(),
      ).toEqual([1, 2, TAIL_PART_NUMBER]);
      expect([...partsOf(stagedUploadId).keys()].sort()).toEqual([1, 2]);

      // The reload: a new uploader, new bytes off the picker, and the key this browser remembered.
      attempt = 2;
      severedPart = null;
      await expect(saveVideoDirect(saveInput(markedUploadBody()))).resolves.toEqual(savedVideo);

      // The whole point: one part on the wire instead of three, and it is the one part the server
      // could not list back — carrying the tail's own bytes, from the tail's own offset.
      expect(sentIn(2)).toEqual([
        {
          attempt: 2,
          uploadId: stagedUploadId,
          partNumber: TAIL_PART_NUMBER,
          sizeBytes: TAIL_PART_BYTES,
          marker: TAIL_PART_NUMBER,
        },
      ]);

      // And it still completes the whole file: the two parts it did not send are claimed under the
      // ETags the server listed back, which this attempt could only have learned by asking.
      expect(claimedParts).toEqual([
        { PartNumber: 1, ETag: '"r2-part-1"' },
        { PartNumber: 2, ETag: '"r2-part-2"' },
        { PartNumber: TAIL_PART_NUMBER, ETag: `"r2-part-${TAIL_PART_NUMBER}"` },
      ]);
      // One staged upload across both attempts, which is what let the second one ask at all.
      expect(stagedUploads.size).toBe(1);
    } finally {
      abandoned.abort();
      await interrupted.catch(() => null);
      severedRelease.settle();
    }
  });
});
