import { createHash } from 'node:crypto';
import {
  PRUNA_IMAGE_TRY_ON_MODEL,
  type DerivedReferenceImageAsset,
  type OutfitTryOnRequest,
} from '@studio/contracts';
import type { OutfitTryOnProvider } from '../../providers/pruna/image-try-on-provider.js';
import { ReferenceImageProviderError } from '../../providers/reference-images/reference-image-provider.js';
import type { ReferenceImageAssetStore } from './asset-store.js';
import { validateUploadedReferenceImage } from './image-validation.js';
import { ReferenceImageGenerationStateError } from './reference-image-error.js';
import { ReferenceImageOperationCoordinator } from './reference-image-operation-coordinator.js';
import {
  assertMatchingRequestFingerprint,
  toReferenceImageAsset,
} from './reference-image-preparation.js';

export interface OutfitTryOnServiceInput extends OutfitTryOnRequest {
  readonly localOwnerId: string;
  readonly sourceAssetId: string;
  readonly signal?: AbortSignal;
}

const requestFingerprint = (input: OutfitTryOnServiceInput): string =>
  createHash('sha256')
    .update(
      JSON.stringify({
        version: 1,
        kind: 'outfit-try-on',
        provider: 'pruna',
        model: PRUNA_IMAGE_TRY_ON_MODEL,
        settings: {
          garmentCount: 1,
          turbo: false,
          outputFormat: 'jpg',
          outputQuality: 95,
          preserveInputSize: true,
        },
        sourceAssetId: input.sourceAssetId,
        garmentAssetId: input.garmentAssetId,
      }),
      'utf8',
    )
    .digest('hex');

export class OutfitTryOnService {
  readonly #provider: OutfitTryOnProvider | null;
  readonly #store: ReferenceImageAssetStore;
  readonly #operations = new ReferenceImageOperationCoordinator();

  constructor(provider: OutfitTryOnProvider | null, store: ReferenceImageAssetStore) {
    this.#provider = provider;
    this.#store = store;
  }

  get available(): boolean {
    return this.#provider !== null;
  }

  async tryOn(input: OutfitTryOnServiceInput): Promise<DerivedReferenceImageAsset> {
    const fingerprint = requestFingerprint(input);
    const persisted = await this.#store.findByRequestId(input.localOwnerId, input.requestId);
    if (persisted !== null) {
      assertMatchingRequestFingerprint(persisted, fingerprint);
      const asset = toReferenceImageAsset(persisted);
      if (asset.source !== 'derived' || asset.derivation.kind !== 'outfit-try-on') {
        throw new ReferenceImageGenerationStateError('request-id-conflict');
      }
      return asset;
    }

    const metadata = await this.#operations.runForOwner({
      localOwnerId: input.localOwnerId,
      requestId: input.requestId,
      requestFingerprint: fingerprint,
      providerId: 'pruna',
      ...(input.signal === undefined ? {} : { signal: input.signal }),
      start: async (operationSignal) => {
        const provider = this.#provider;
        if (provider === null) {
          throw new ReferenceImageGenerationStateError('provider-not-configured');
        }
        const [person, garment] = await Promise.all([
          this.#store.getContent(input.localOwnerId, input.sourceAssetId),
          this.#store.getContent(input.localOwnerId, input.garmentAssetId),
        ]);
        if (person === null || garment === null) {
          throw new ReferenceImageGenerationStateError('source-asset-not-found');
        }
        let result;
        try {
          result = await provider.tryOn({
            person: { bytes: person.bytes, mimeType: person.metadata.mimeType },
            garment: { bytes: garment.bytes, mimeType: garment.metadata.mimeType },
            signal: operationSignal,
          });
        } catch (error) {
          if (error instanceof ReferenceImageProviderError) throw error;
          throw new ReferenceImageProviderError('failure', {
            providerId: 'pruna',
            cause: error,
          });
        }
        if (result.providerId !== 'pruna' || result.modelId !== PRUNA_IMAGE_TRY_ON_MODEL) {
          throw new ReferenceImageProviderError('invalid-response', { providerId: 'pruna' });
        }
        let validated;
        try {
          validated = await validateUploadedReferenceImage(
            Buffer.from(result.bytes),
            result.mimeType,
            operationSignal,
          );
        } catch (error) {
          throw new ReferenceImageProviderError('invalid-response', {
            providerId: 'pruna',
            cause: error,
          });
        }
        operationSignal.throwIfAborted();
        return this.#store.store({
          localOwnerId: input.localOwnerId,
          bytes: validated.bytes,
          mimeType: validated.mimeType,
          source: 'derived',
          width: validated.width,
          height: validated.height,
          provider: 'pruna',
          model: PRUNA_IMAGE_TRY_ON_MODEL,
          derivation: {
            kind: 'outfit-try-on',
            sourceAssetId: input.sourceAssetId,
            garmentAssetId: input.garmentAssetId,
          },
          requestId: input.requestId,
          requestFingerprint: fingerprint,
          requestFingerprintVersion: 2,
          ...(result.providerRequestId === undefined
            ? {}
            : { providerRequestId: result.providerRequestId }),
        });
      },
    });
    const asset = toReferenceImageAsset(metadata);
    if (asset.source !== 'derived') {
      throw new ReferenceImageProviderError('invalid-response', { providerId: 'pruna' });
    }
    return asset;
  }
}
