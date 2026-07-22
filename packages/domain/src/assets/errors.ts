import { DomainRuleError } from '../errors/safe-error';

export type AssetRuleErrorReason = 'invalid-id' | 'invalid-name' | 'invalid-prompt' | 'not-found';

/** Stable machine-readable failure for creative-asset operations. */
export class AssetRuleError extends DomainRuleError {
  readonly reason: AssetRuleErrorReason;

  constructor(reason: AssetRuleErrorReason, message: string, options?: ErrorOptions) {
    super('invalid-input', message, options);
    this.name = 'AssetRuleError';
    this.reason = reason;
  }
}
