import { describe, expect, it, vi } from 'vitest';
import { APIConnectionError, APIConnectionTimeoutError, APIUserAbortError } from 'openai';
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
    const provider = new OpenAIReferenceImageProvider(
      'server-secret',
      { timeoutMs: 149_000, model: 'gpt-image-configured', quality: 'medium' },
      factory,
    );

    await expect(
      provider.generate({
        prompt: 'derived reference prompt',
        size: '1024x1536',
        format: 'webp',
      }),
    ).resolves.toEqual({
      base64: 'aW1hZ2U=',
      providerRequestId: 'openai-request-one',
    });
    expect(factory).toHaveBeenCalledWith({
      apiKey: 'server-secret',
      maxRetries: 0,
      timeout: 149_000,
    });
    expect(calls).toEqual([
      {
        ...OPENAI_REFERENCE_IMAGE_PARAMETERS,
        model: 'gpt-image-configured',
        quality: 'medium',
        size: '1024x1536',
        output_format: 'webp',
        prompt: 'derived reference prompt',
      },
    ]);
    expect(calls[0]).not.toHaveProperty('response_format');
    expect(calls[0]).not.toHaveProperty('user');
  });

  it('omits output compression for PNG generation', async () => {
    const generate = vi.fn((_parameters: unknown) =>
      Promise.resolve({ created: 1, data: [{ b64_json: 'cG5n' }] }),
    );
    const provider = new OpenAIReferenceImageProvider('server-secret', {}, () => ({
      images: { generate },
    }));

    await provider.generate({
      prompt: 'lossless reference prompt',
      size: '1024x1024',
      format: 'png',
    });

    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        output_format: 'png',
        prompt: 'lossless reference prompt',
      }),
    );
    expect(generate.mock.calls[0]?.[0]).not.toHaveProperty('output_compression');
  });

  it('uploads stored source bytes to the image edit endpoint without input_fidelity', async () => {
    const edit = vi.fn((_parameters: unknown, _options?: unknown) =>
      Promise.resolve({
        created: 1,
        data: [{ b64_json: 'ZWRpdGVk' }],
        _request_id: 'openai-edit-one',
      }),
    );
    const provider = new OpenAIReferenceImageProvider(
      'server-secret',
      { model: 'gpt-image-2', quality: 'high' },
      () => ({ images: { generate: vi.fn(), edit } }),
    );
    const controller = new AbortController();

    await expect(
      provider.edit({
        source: { bytes: new Uint8Array([1, 2, 3]), mimeType: 'image/webp' },
        prompt: 'Keep the same character and change only the coat to green.',
        size: '1024x1536',
        format: 'webp',
        signal: controller.signal,
      }),
    ).resolves.toEqual({
      base64: 'ZWRpdGVk',
      providerRequestId: 'openai-edit-one',
    });

    expect(edit).toHaveBeenCalledOnce();
    const [parameters, requestOptions] = edit.mock.calls[0] ?? [];
    expect(parameters).toMatchObject({
      model: 'gpt-image-2',
      n: 1,
      background: 'opaque',
      quality: 'high',
      size: '1024x1536',
      output_format: 'webp',
      output_compression: 90,
      prompt: 'Keep the same character and change only the coat to green.',
      image: { name: 'reference.webp', type: 'image/webp', size: 3 },
    });
    expect(parameters).not.toHaveProperty('input_fidelity');
    expect(parameters).not.toHaveProperty('moderation');
    expect(parameters).not.toHaveProperty('user');
    expect(requestOptions).toEqual({ signal: controller.signal });
  });

  it('rejects a response without documented b64_json image data', async () => {
    const provider = new OpenAIReferenceImageProvider(
      'server-secret',
      { timeoutMs: 1_000 },
      () => ({
        images: {
          generate: () => Promise.resolve({ created: 1, data: [{ url: 'https://expiring' }] }),
        },
      }),
    );

    await expect(
      provider.generate({ prompt: 'prompt', size: '1024x1024', format: 'jpeg' }),
    ).rejects.toMatchObject({
      name: 'ReferenceImageProviderError',
      reason: 'invalid-response',
    });
  });

  it('normalizes provider connection, timeout, abort, and HTTP failures', async () => {
    const failures = [
      {
        error: new APIUserAbortError(),
        reason: 'aborted',
      },
      {
        error: new APIConnectionTimeoutError(),
        reason: 'timeout',
      },
      {
        error: new APIConnectionError({ cause: new Error('unreachable') }),
        reason: 'connection',
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
      const provider = new OpenAIReferenceImageProvider(
        'server-secret',
        { timeoutMs: 1_000 },
        () => ({
          images: { generate: () => Promise.reject(failure.error) },
        }),
      );
      const error = await provider
        .generate({ prompt: 'prompt', size: '1024x1024', format: 'jpeg' })
        .catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(ReferenceImageProviderError);
      expect(error).toMatchObject({ reason: failure.reason });
    }
  });

  it('does not misclassify an unrelated 400 that mentions moderation', async () => {
    const provider = new OpenAIReferenceImageProvider(
      'server-secret',
      { timeoutMs: 1_000 },
      () => ({
        images: {
          generate: () =>
            Promise.reject(
              Object.assign(new Error('Invalid value for the moderation parameter'), {
                status: 400,
                code: 'invalid_value',
              }),
            ),
        },
      }),
    );

    await expect(
      provider.generate({ prompt: 'prompt', size: '1024x1024', format: 'jpeg' }),
    ).rejects.toMatchObject({
      name: 'ReferenceImageProviderError',
      reason: 'failure',
      upstreamStatus: 400,
    });
  });
});
