export type ReferenceImageGenerationStateErrorReason =
  | 'edit-not-configured'
  | 'generation-in-progress'
  | 'request-id-conflict'
  | 'source-asset-not-found'
  | 'optimizer-not-configured'
  | 'provider-not-configured'
  | 'stale-optimization'
  | 'invalid-optimization'
  | 'operation-aborted';

export class ReferenceImageGenerationStateError extends Error {
  readonly reason: ReferenceImageGenerationStateErrorReason;

  constructor(reason: ReferenceImageGenerationStateErrorReason) {
    super(`Reference image generation unavailable: ${reason}`);
    this.name = 'ReferenceImageGenerationStateError';
    this.reason = reason;
  }
}
