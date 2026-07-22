import { classifyBrowserError, createSafeError } from '@studio/domain';

export type SafeMediaError = {
  code: string;
  message: string;
  recovery?: string;
};

export const toSafeMediaError = (error: unknown, fallback: string): SafeMediaError => {
  const safe = classifyBrowserError(error, createSafeError('unknown', fallback));
  return {
    code: safe.code,
    message: safe.message,
    ...(safe.recovery ? { recovery: safe.recovery } : {}),
  };
};
