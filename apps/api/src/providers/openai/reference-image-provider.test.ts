import { describe, expect, it, vi } from 'vitest';
import {
  OPENAI_REFERENCE_IMAGE_PARAMETERS,
  OpenAIReferenceImageProvider,
  ReferenceImageProviderError,
} from './reference-image-provider.js';

describe('OpenAIReferenceImageProvider', () => {
  it('disables SDK retries and sends the exact GPT Image 2 contract', async () => {
    const calls: unknown[] = [];
    const factory = vi.fn((options: unknown) => ({
      images: {
        generate: vi.fn((parameters: unknown) => {
          calls.push(parameters);
          return Promise.resolve({
            created: 1,
            data: [{ b64_json: 'aW1hZ2U=' }],
            _request_id: 'openai-request-one',
          });
        }),
      },
      options,
    }));
    const provider = new OpenAIReferenceImageProvider('server-secret', 149_000, factory);

    await expect(provider.generate('derived reference prompt')).resolves.toEqual({
      base64: 'aW1hZ2U=',
      providerRequestId: 'openai-request-one',
    });
    expect(factory).toHaveBeenCalledWith({
      apiKey: 'server-secret',
      maxRetries: 0,
      timeout: 149_000,
    });
    expect(calls).toEqual([
      { ...OPENAI_REFERENCE_IMAGE_PARAMETERS, prompt: 'derived reference prompt' },
    ]);
    expect(calls[0]).not.toHaveProperty('response_format');
    expect(calls[0]).not.toHaveProperty('user');
  });

  it('rejects a response without documented b64_json image data', async () => {
    const provider = new OpenAIReferenceImageProvider('server-secret', 1_000, () => ({
      images: {
        generate: () => Promise.resolve({ created: 1, data: [{ url: 'https://expiring' }] }),
      },
    }));

    await expect(provider.generate('prompt')).rejects.toMatchObject({
      name: 'ReferenceImageProviderError',
      reason: 'invalid-response',
    });
  });

  it('normalizes provider timeout, rate limit, authentication, and moderation failures', async () => {
    const failures = [
      {
        error: Object.assign(new Error('timeout'), { name: 'APIConnectionTimeoutError' }),
        reason: 'timeout',
      },
      { error: Object.assign(new Error('slow down'), { status: 429 }), reason: 'rate-limit' },
      { error: Object.assign(new Error('bad key'), { status: 401 }), reason: 'authentication' },
      {
        error: Object.assign(new Error('request rejected'), {
          status: 400,
          code: 'moderation_blocked',
        }),
        reason: 'moderation',
      },
    ] as const;

    for (const failure of failures) {
      const provider = new OpenAIReferenceImageProvider('server-secret', 1_000, () => ({
        images: { generate: () => Promise.reject(failure.error) },
      }));
      const error = await provider.generate('prompt').catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(ReferenceImageProviderError);
      expect(error).toMatchObject({ reason: failure.reason });
    }
  });

  it('does not misclassify an unrelated 400 that mentions moderation', async () => {
    const provider = new OpenAIReferenceImageProvider('server-secret', 1_000, () => ({
      images: {
        generate: () =>
          Promise.reject(
            Object.assign(new Error('Invalid value for the moderation parameter'), {
              status: 400,
              code: 'invalid_value',
            }),
          ),
      },
    }));

    await expect(provider.generate('prompt')).rejects.toMatchObject({
      name: 'ReferenceImageProviderError',
      reason: 'failure',
      upstreamStatus: 400,
    });
  });
});
