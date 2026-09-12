import type { OptimizeCharacterReferencePromptResponse } from '@studio/contracts';
import {
  createSharedOperation,
  KeyedSharedOperations,
  type SharedOperation,
} from '../../application/shared-operation.js';
import { CharacterPromptOptimizerError } from '../../providers/openai/character-prompt-optimizer.js';
import { ReferenceImageProviderError } from '../../providers/reference-images/reference-image-provider.js';
import type { ReferenceImageProviderErrorId } from '../../providers/reference-images/reference-image-provider.js';
import type {
  RecordReferenceImageSubmissionInput,
  ReferenceImageAssetStore,
  StoredReferenceImageMetadata,
} from './asset-store.js';

export interface ReferenceImageSpendClaim {
  readonly store: Pick<ReferenceImageAssetStore, 'claimSubmission' | 'clearSubmission'>;
  readonly claim: RecordReferenceImageSubmissionInput;
}
import { ReferenceImageGenerationStateError } from './reference-image-error.js';

interface ActiveReferenceImageOperation {
  readonly requestId: string;
  readonly requestFingerprint: string;
  readonly operation: SharedOperation<StoredReferenceImageMetadata>;
}

export class ReferenceImageOperationCoordinator {
  readonly #activeOptimizations =
    new KeyedSharedOperations<OptimizeCharacterReferencePromptResponse>();
  readonly #activeByOwner = new Map<string, ActiveReferenceImageOperation>();

  runOptimization(
    inputHash: string,
    signal: AbortSignal | undefined,
    start: (signal: AbortSignal) => Promise<OptimizeCharacterReferencePromptResponse>,
  ): Promise<OptimizeCharacterReferencePromptResponse> {
    return this.#activeOptimizations.run(inputHash, {
      signal,
      abortedError: () => new CharacterPromptOptimizerError('aborted'),
      start,
    });
  }

  /**
   * Wraps paid work in a durable claim on its request id.
   *
   * The two refusals above hold only for as long as this process does. A request that reaches a
   * provider outlives that: the money is gone whether or not the operation survives, so a retry
   * carrying the same id — which the browser deliberately sends — must be refused until something
   * settles what the first attempt cost. A refusal raised before the provider is reached costs
   * nothing, so it releases the claim rather than blocking the operator's next attempt.
   */
  static #withSpendClaim(
    spend: ReferenceImageSpendClaim,
    start: (signal: AbortSignal) => Promise<StoredReferenceImageMetadata>,
  ): (signal: AbortSignal) => Promise<StoredReferenceImageMetadata> {
    return async (signal) => {
      if (!(await spend.store.claimSubmission(spend.claim))) {
        throw new ReferenceImageGenerationStateError('submission-unresolved');
      }
      try {
        const metadata = await start(signal);
        await spend.store.clearSubmission(spend.claim.localOwnerId, spend.claim.requestId);
        return metadata;
      } catch (error) {
        if (error instanceof ReferenceImageGenerationStateError) {
          await spend.store.clearSubmission(spend.claim.localOwnerId, spend.claim.requestId);
        }
        throw error;
      }
    };
  }

  runForOwner(input: {
    readonly localOwnerId: string;
    readonly requestId: string;
    readonly requestFingerprint: string;
    readonly providerId?: ReferenceImageProviderErrorId;
    readonly signal?: AbortSignal;
    /** Present only for work that reaches a paid provider; a local upload declares none. */
    readonly spend?: ReferenceImageSpendClaim;
    readonly start: (signal: AbortSignal) => Promise<StoredReferenceImageMetadata>;
  }): Promise<StoredReferenceImageMetadata> {
    const active = this.#activeByOwner.get(input.localOwnerId);
    if (active !== undefined) {
      if (active.requestId !== input.requestId) {
        throw new ReferenceImageGenerationStateError('generation-in-progress');
      }
      if (active.requestFingerprint !== input.requestFingerprint) {
        throw new ReferenceImageGenerationStateError('request-id-conflict');
      }
      if (!active.operation.acceptingSubscribers) {
        throw new ReferenceImageGenerationStateError('generation-in-progress');
      }
      return active.operation.subscribe(input.signal, () =>
        input.providerId === undefined
          ? new ReferenceImageGenerationStateError('operation-aborted')
          : new ReferenceImageProviderError('aborted', { providerId: input.providerId }),
      );
    }

    const operation = createSharedOperation(
      input.spend === undefined
        ? input.start
        : ReferenceImageOperationCoordinator.#withSpendClaim(input.spend, input.start),
    );
    this.#activeByOwner.set(input.localOwnerId, {
      requestId: input.requestId,
      requestFingerprint: input.requestFingerprint,
      operation,
    });
    const release = (): void => {
      if (this.#activeByOwner.get(input.localOwnerId)?.operation === operation) {
        this.#activeByOwner.delete(input.localOwnerId);
      }
    };
    void operation.result.then(release, release);
    return operation.subscribe(input.signal, () =>
      input.providerId === undefined
        ? new ReferenceImageGenerationStateError('operation-aborted')
        : new ReferenceImageProviderError('aborted', { providerId: input.providerId }),
    );
  }
}
