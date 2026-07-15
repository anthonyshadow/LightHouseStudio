export type VoiceServiceFailureReason =
  | 'configured-model-unavailable'
  | 'configured-model-incompatible'
  | 'voice-incompatible'
  | 'shared-voice-ineligible'
  | 'shared-voice-not-found'
  | 'preview-unavailable'
  | 'zero-retention-required';

export class VoiceServiceError extends Error {
  readonly reason: VoiceServiceFailureReason;
  readonly upstreamStatus?: number;

  constructor(reason: VoiceServiceFailureReason, upstreamStatus?: number) {
    super('Voice operation could not be completed.');
    this.name = 'VoiceServiceError';
    this.reason = reason;
    if (upstreamStatus !== undefined) this.upstreamStatus = upstreamStatus;
  }
}
