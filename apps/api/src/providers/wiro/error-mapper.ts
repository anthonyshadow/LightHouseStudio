import { createReferenceImageErrorTranslator } from '../reference-images/error-mapper-profile.js';

export const translateWiroError = createReferenceImageErrorTranslator({
  providerId: 'wiro',
  messages: {
    moderation:
      'Wiro blocked the prompt, source image, or generated result. Try another source image or revise the character description.',
    'rate-limit':
      'Wiro has no generation capacity available for this project right now. Wait a moment, then generate again with a new request.',
    authentication:
      'Wiro rejected the configured signature credentials. Check WIRO_API_KEY and WIRO_API_SECRET.',
    credits: 'The Wiro project has insufficient balance for reference image generation.',
    configuration: 'Reference generation is unavailable until Wiro is configured on the server.',
    'invalid-request': 'Wiro rejected the reference image request or source image.',
    connection:
      'The API server lost its connection to Wiro during reference image generation. Check the Recent Shelf, then verify server network, DNS, TLS, and proxy access before deliberately trying again.',
    timeout:
      'Wiro image generation took too long. Check the Recent Shelf before deliberately trying again.',
    'invalid-response':
      'Wiro returned no usable image. Generate again when the provider is available.',
    failure:
      'Wiro could not complete reference image generation. Try again with a new request when ready.',
  },
});
