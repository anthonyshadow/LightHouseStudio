import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';
import type {
  OutfitTryOnProvider,
  OutfitTryOnProviderResult,
} from '../../providers/pruna/image-try-on-provider.js';
import type { ReferenceImageAssetStore, StoreReferenceImageInput } from './asset-store.js';
import {
  createStoredReferenceImageMetadata,
  type StoredReferenceImageMetadata,
} from './asset-layout.js';
import { OutfitTryOnService } from './outfit-try-on-service.js';

const owner = 'a'.repeat(64);
const otherOwner = 'b'.repeat(64);
const sourceId = 'd41f9e16-28ee-43a5-a92e-d7cc50148012';
const garmentId = '189139bd-07a9-44d8-8f19-736a959d5269';
const otherGarmentId = 'a3a431cc-a67f-43cf-b4b4-ddbdbbdd5069';
const resultId = '3badb278-c765-47eb-aa8e-19ea94ddb05b';
const requestId = 'a98e386f-b3fc-438b-8b72-a5d2bd661a14';

const image = (color: string) =>
  sharp({ create: { width: 80, height: 120, channels: 3, background: color } })
    .jpeg()
    .toBuffer();

const createFixture = async () => {
  const sourceBytes = await image('#4b6175');
  const garmentBytes = await image('#6f3b45');
  const outputBytes = await image('#384d3d');
  const metadata = new Map<string, StoredReferenceImageMetadata>();
  for (const [id, bytes, idempotencyId] of [
    [sourceId, sourceBytes, '7b545e4e-faf7-44bc-836a-6f3f82bb4194'],
    [garmentId, garmentBytes, '97d00922-37e0-45ec-a481-568f33e0a83e'],
    [otherGarmentId, garmentBytes, 'fb550df8-7d25-47ca-b53d-d9fa6ec58304'],
  ] as const) {
    metadata.set(
      id,
      createStoredReferenceImageMetadata(
        {
          localOwnerId: owner,
          bytes,
          mimeType: 'image/jpeg',
          source: 'uploaded',
          width: 80,
          height: 120,
          requestId: idempotencyId,
          requestFingerprint: 'c'.repeat(64),
        },
        id,
        '2026-08-01T12:00:00.000Z',
      ),
    );
  }
  const byRequest = new Map<string, StoredReferenceImageMetadata>();
  const storedInputs: StoreReferenceImageInput[] = [];
  const store: ReferenceImageAssetStore = {
    findByRequestId: (ownerId, id) => Promise.resolve(byRequest.get(`${ownerId}:${id}`) ?? null),
    getMetadata: (ownerId, id) =>
      Promise.resolve(ownerId === owner ? (metadata.get(id) ?? null) : null),
    getContent: (ownerId, id) => {
      if (ownerId !== owner) return Promise.resolve(null);
      const item = metadata.get(id);
      if (!item) return Promise.resolve(null);
      const bytes = id === sourceId ? sourceBytes : garmentBytes;
      return Promise.resolve({ metadata: item, bytes });
    },
    store: (input) => {
      storedInputs.push(input);
      const stored = createStoredReferenceImageMetadata(
        input,
        resultId,
        '2026-08-01T12:01:00.000Z',
      );
      metadata.set(resultId, stored);
      byRequest.set(`${input.localOwnerId}:${input.requestId}`, stored);
      return Promise.resolve(stored);
    },
  };
  return { store, storedInputs, outputBytes };
};

const providerResult = (bytes: Uint8Array): OutfitTryOnProviderResult => ({
  bytes,
  mimeType: 'image/jpeg',
  providerId: 'pruna',
  modelId: 'p-image-try-on',
  providerRequestId: 'prediction-private',
});

describe('OutfitTryOnService', () => {
  it('coalesces identical request IDs, stores exact lineage, and replays the local result', async () => {
    const fixture = await createFixture();
    let finish: ((value: OutfitTryOnProviderResult) => void) | undefined;
    const provider: OutfitTryOnProvider = {
      modelId: 'p-image-try-on',
      tryOn: vi.fn(
        () =>
          new Promise<OutfitTryOnProviderResult>((resolve) => {
            finish = resolve;
          }),
      ),
    };
    const service = new OutfitTryOnService(provider, fixture.store);
    const input = {
      localOwnerId: owner,
      sourceAssetId: sourceId,
      garmentAssetId: garmentId,
      requestId,
    };
    const first = service.tryOn(input);
    const duplicate = service.tryOn(input);
    await vi.waitFor(() => expect(provider.tryOn).toHaveBeenCalledOnce());
    finish?.(providerResult(fixture.outputBytes));

    await expect(first).resolves.toMatchObject({
      assetId: resultId,
      source: 'derived',
      provider: 'pruna',
      model: 'p-image-try-on',
      derivation: { kind: 'outfit-try-on', sourceAssetId: sourceId, garmentAssetId: garmentId },
    });
    await expect(duplicate).resolves.toMatchObject({ assetId: resultId });
    expect(fixture.storedInputs).toHaveLength(1);
    expect(fixture.storedInputs[0]).toMatchObject({
      source: 'derived',
      requestFingerprintVersion: 2,
      providerRequestId: 'prediction-private',
    });

    await expect(service.tryOn(input)).resolves.toMatchObject({ assetId: resultId });
    expect(provider.tryOn).toHaveBeenCalledOnce();
  });

  it('rejects conflicting request reuse and cross-owner source access before provider contact', async () => {
    const fixture = await createFixture();
    let finish: ((value: OutfitTryOnProviderResult) => void) | undefined;
    const provider: OutfitTryOnProvider = {
      modelId: 'p-image-try-on',
      tryOn: vi.fn(
        () =>
          new Promise<OutfitTryOnProviderResult>((resolve) => {
            finish = resolve;
          }),
      ),
    };
    const service = new OutfitTryOnService(provider, fixture.store);
    const first = service.tryOn({
      localOwnerId: owner,
      sourceAssetId: sourceId,
      garmentAssetId: garmentId,
      requestId,
    });
    await vi.waitFor(() => expect(provider.tryOn).toHaveBeenCalledOnce());
    await expect(
      service.tryOn({
        localOwnerId: owner,
        sourceAssetId: sourceId,
        garmentAssetId: otherGarmentId,
        requestId,
      }),
    ).rejects.toMatchObject({ reason: 'request-id-conflict' });
    finish?.(providerResult(fixture.outputBytes));
    await first;

    await expect(
      service.tryOn({
        localOwnerId: otherOwner,
        sourceAssetId: sourceId,
        garmentAssetId: garmentId,
        requestId: '9f4af54e-d4b6-443d-8090-8865b53c9d87',
      }),
    ).rejects.toMatchObject({ reason: 'source-asset-not-found' });
    expect(provider.tryOn).toHaveBeenCalledOnce();
  });

  it('maps malformed provider image bytes to a sanitized provider failure before storage', async () => {
    const fixture = await createFixture();
    const provider: OutfitTryOnProvider = {
      modelId: 'p-image-try-on',
      tryOn: vi.fn(() => Promise.resolve(providerResult(Buffer.from('not an image')))),
    };
    const service = new OutfitTryOnService(provider, fixture.store);

    await expect(
      service.tryOn({
        localOwnerId: owner,
        sourceAssetId: sourceId,
        garmentAssetId: garmentId,
        requestId,
      }),
    ).rejects.toMatchObject({ providerId: 'pruna', reason: 'invalid-response' });
    expect(fixture.storedInputs).toEqual([]);
  });
});
