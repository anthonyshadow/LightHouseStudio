export type ProviderOperation =
  | 'token'
  | 'models'
  | 'workspace-voices'
  | 'workspace-voice'
  | 'shared-voices'
  | 'import'
  | 'preview'
  | 'conversion';

export type ProviderFailureReason =
  | 'aborted'
  | 'timeout'
  | 'upstream'
  | 'invalid-response'
  | 'invalid-audio'
  | 'feature-unavailable'
  | 'zero-retention-unavailable'
  | 'quota'
  | 'rate-limit';

export class ProviderError extends Error {
  readonly operation: ProviderOperation;
  readonly reason: ProviderFailureReason;
  readonly upstreamStatus?: number;

  constructor(
    operation: ProviderOperation,
    reason: ProviderFailureReason,
    upstreamStatus?: number,
  ) {
    super('Provider request failed.');
    this.name = 'ProviderError';
    this.operation = operation;
    this.reason = reason;
    if (upstreamStatus !== undefined) this.upstreamStatus = upstreamStatus;
  }
}
