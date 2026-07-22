import type { OptimizeCharacterReferencePromptResponse } from '@studio/contracts';
import { createSharedOperation, type SharedOperation } from '../../application/shared-operation.js';
import { CharacterPromptOptimizerError } from '../../providers/openai/character-prompt-optimizer.js';
import { ReferenceImageProviderError } from '../../providers/openai/reference-image-provider.js';
import type { StoredReferenceImageMetadata } from './asset-store.js';
import { ReferenceImageGenerationStateError } from './reference-image-error.js';

interface ActiveReferenceImageOperation {
  readonly requestId: string;
  readonly requestFingerprint: string;
  readonly operation: SharedOperation<StoredReferenceImageMetadata>;
}

export class ReferenceImageOperationCoordinator {
  readonly #activeOptimizations = new Map<
    string,
    SharedOperation<OptimizeCharacterReferencePromptResponse>
  >();
  readonly #activeByOwner = new Map<string, ActiveReferenceImageOperation>();

  runOptimization(
    inputHash: string,
    signal: AbortSignal | undefined,
    start: (signal: AbortSignal) => Promise<OptimizeCharacterReferencePromptResponse>,
  ): Promise<OptimizeCharacterReferencePromptResponse> {
    const active = this.#activeOptimizations.get(inputHash);
    if (active?.acceptingSubscribers === true) {
      return active.subscribe(signal, () => new CharacterPromptOptimizerError('aborted'));
    }
    if (active !== undefined) this.#activeOptimizations.delete(inputHash);

    const operation = createSharedOperation(start);
    this.#activeOptimizations.set(inputHash, operation);
    const release = (): void => {
      if (this.#activeOptimizations.get(inputHash) === operation) {
        this.#activeOptimizations.delete(inputHash);
      }
    };
    void operation.result.then(release, release);
    return operation.subscribe(signal, () => new CharacterPromptOptimizerError('aborted'));
  }

  runForOwner(input: {
    readonly localOwnerId: string;
    readonly requestId: string;
    readonly requestFingerprint: string;
    readonly signal?: AbortSignal;
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
      return active.operation.subscribe(
        input.signal,
        () => new ReferenceImageProviderError('aborted'),
      );
    }

    const operation = createSharedOperation(input.start);
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
    return operation.subscribe(input.signal, () => new ReferenceImageProviderError('aborted'));
  }
}
