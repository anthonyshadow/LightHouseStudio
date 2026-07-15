export type SafeMediaError = {
  code: string;
  message: string;
  recovery?: string;
};

const namedMessage = (name: string): SafeMediaError | null => {
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return {
      code: 'permission-denied',
      message: 'Camera or microphone access was not allowed.',
      recovery: 'Allow access in browser settings, then try again.',
    };
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return {
      code: 'device-missing',
      message: 'A usable camera and microphone could not be found.',
      recovery: 'Connect or enable the devices, then try again.',
    };
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return {
      code: 'device-busy',
      message: 'The camera or microphone is busy in another application.',
      recovery: 'Close the other application and try again.',
    };
  }
  if (name === 'OverconstrainedError') {
    return {
      code: 'constraints-unavailable',
      message: 'The selected camera cannot provide the requested format.',
      recovery: 'Choose another device or retry with browser defaults.',
    };
  }
  if (name === 'AbortError') {
    return { code: 'canceled', message: 'The operation was canceled.' };
  }
  return null;
};

export const toSafeMediaError = (error: unknown, fallback: string): SafeMediaError => {
  if (error instanceof DOMException) {
    return namedMessage(error.name) ?? { code: 'media-error', message: fallback };
  }
  if (error instanceof Error && error.name) {
    return namedMessage(error.name) ?? { code: 'unexpected', message: fallback };
  }
  return { code: 'unexpected', message: fallback };
};
