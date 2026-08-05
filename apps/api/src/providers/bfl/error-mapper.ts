import { createReferenceImageErrorTranslator } from '../reference-images/error-mapper-profile.js';

export const translateBflError = createReferenceImageErrorTranslator({
  providerId: 'bfl',
  messages: {
    moderation:
      'Black Forest Labs blocked the prompt, source image, or generated result under its safety checks. Try another source image or revise the character description.',
    'rate-limit':
      'Black Forest Labs is temporarily rate limiting image generation. Wait a moment, then generate again with a new request.',
    authentication:
      'Black Forest Labs rejected the configured server credential or model permission. Check BFL_API_KEY.',
    credits:
      'The Black Forest Labs account has insufficient credits for reference image generation.',
    configuration:
      'Reference generation is unavailable until Black Forest Labs is configured on the server.',
    'invalid-request': 'Black Forest Labs rejected the reference image request or source image.',
    connection:
      'The API server lost its connection to Black Forest Labs during reference image generation. Check the Recent Shelf, then verify server network, DNS, TLS, and proxy access before deliberately trying again.',
    timeout:
      'Black Forest Labs image generation took too long. Check the Recent Shelf before deliberately trying again.',
    'invalid-response':
      'Black Forest Labs returned no usable image. Generate again when the provider is available.',
    failure:
      'Black Forest Labs could not complete reference image generation. Try again with a new request when ready.',
  },
});
