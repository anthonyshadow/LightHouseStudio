export type SafeErrorCode =
  | 'aborted'
  | 'camera-denied'
  | 'device-busy'
  | 'device-missing'
  | 'invalid-input'
  | 'media-unavailable'
  | 'model-unavailable'
  | 'network-failure'
  | 'not-configured'
  | 'payload-too-large'
  | 'permission-denied'
  | 'provider-authentication'
  | 'provider-billing'
  | 'provider-incompatible'
  | 'provider-not-found'
  | 'provider-policy'
  | 'provider-quota'
  | 'provider-unavailable'
  | 'recording-failure'
  | 'storage-unavailable'
  | 'unsupported-browser'
  | 'voice-processing-failure'
  | 'unknown';

export interface SafeError {
  readonly code: SafeErrorCode;
  readonly message: string;
  readonly retryable: boolean;
  readonly recovery?: string;
  readonly upstreamStatus?: number;
}

export class DomainRuleError extends Error {
  readonly code: SafeErrorCode;

  constructor(code: SafeErrorCode, message: string) {
    super(message);
    this.name = 'DomainRuleError';
    this.code = code;
  }
}

const browserErrorMap: Readonly<Record<string, SafeError>> = {
  AbortError: {
    code: 'aborted',
    message: 'The operation was cancelled.',
    retryable: true,
  },
  NotAllowedError: {
    code: 'camera-denied',
    message: 'Camera or microphone access was not allowed.',
    retryable: true,
    recovery: 'Allow camera and microphone access in your browser, then try again.',
  },
  NotFoundError: {
    code: 'device-missing',
    message: 'A camera or microphone could not be found.',
    retryable: false,
    recovery: 'Connect a media device or choose another available input.',
  },
  NotReadableError: {
    code: 'device-busy',
    message: 'The camera or microphone is unavailable or already in use.',
    retryable: true,
    recovery: 'Close other apps using the device, then try again.',
  },
  OverconstrainedError: {
    code: 'media-unavailable',
    message: 'The selected device cannot provide the requested media.',
    retryable: true,
    recovery: 'Choose another device or use adaptable quality settings.',
  },
  SecurityError: {
    code: 'permission-denied',
    message: 'The browser blocked access to this media capability.',
    retryable: false,
    recovery: 'Use a secure local page and review browser permissions.',
  },
};

export const createSafeError = (
  code: SafeErrorCode,
  message: string,
  options: { retryable?: boolean; recovery?: string; upstreamStatus?: number } = {},
): SafeError => ({
  code,
  message,
  retryable: options.retryable ?? false,
  ...(options.recovery ? { recovery: options.recovery } : {}),
  ...(options.upstreamStatus === undefined ? {} : { upstreamStatus: options.upstreamStatus }),
});

/** Maps known browser error names without forwarding an arbitrary error message. */
export const classifyBrowserError = (error: unknown, fallback: SafeError): SafeError => {
  if (error instanceof DomainRuleError) {
    return createSafeError(error.code, error.message);
  }

  if (typeof error === 'object' && error !== null && 'name' in error) {
    const name = (error as { name?: unknown }).name;
    if (typeof name === 'string' && browserErrorMap[name]) return browserErrorMap[name];
  }

  return fallback;
};
