import { mkdtemp, rm } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { CreateReferenceImageRequest } from '@studio/contracts';
import sharp from 'sharp';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app.js';
import {
  ReferenceImageProviderError,
  type GenerateReferenceImageProviderInput,
  type GeneratedReferenceImagePayload,
  type ReferenceImageProvider,
} from '../../providers/reference-images/reference-image-provider.js';
import { testConfig } from '../../test/fakes.js';
import { LocalReferenceImageAssetStore } from './asset-store.js';

const requestId = '37d15fec-43a3-47b2-8330-7fb410698564';
const requestPayload: CreateReferenceImageRequest = {
  requestId,
  rawPrompt: 'A patient cartographer',
  options: {
    framing: 'head_and_shoulders',
    orientation: 'square',
    renderingMode: 'photorealistic',
    expression: 'neutral',
    background: 'neutral_gray',
    targetUse: 'lucy_2_5_character_reference',
  },
  optimization: { enabled: false },
};

const providerImage = (bytes: Uint8Array): GeneratedReferenceImagePayload => ({
  bytes,
  mimeType: 'image/jpeg',
  providerId: 'openai',
  modelId: 'gpt-image-2',
});

describe('reference-image real-socket lifecycle', () => {
  const applications: ReturnType<typeof createApp>[] = [];
  const directories: string[] = [];

  afterEach(async () => {
    await Promise.all(applications.splice(0).map(async (app) => app.close()));
    await Promise.all(
      directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
    );
  });

  it('does not cancel pending generation when a normal request body finishes', async () => {
    const image = await sharp({
      create: { width: 1024, height: 1024, channels: 3, background: '#8f6c52' },
    })
      .jpeg({ quality: 90 })
      .toBuffer();
    let providerSignal: AbortSignal | undefined;
    const provider: ReferenceImageProvider = {
      descriptor: {
        providerId: 'openai',
        modelId: 'gpt-image-2',
        adapterVersion: 'openai-gpt-image-v1',
        effectiveSettings: { quality: 'high' },
      },
      generate: vi.fn(
        (input: GenerateReferenceImageProviderInput) =>
          new Promise<GeneratedReferenceImagePayload>((resolve, reject) => {
            providerSignal = input.signal;
            const timer = setTimeout(() => resolve(providerImage(image)), 50);
            const abort = () => {
              clearTimeout(timer);
              reject(new ReferenceImageProviderError('aborted', { providerId: 'openai' }));
            };
            if (input.signal?.aborted === true) abort();
            else input.signal?.addEventListener('abort', abort, { once: true });
          }),
      ),
    };
    const directory = await mkdtemp(path.join(tmpdir(), 'lightframe-reference-socket-'));
    directories.push(directory);
    const app = createApp({
      config: testConfig({ lightframeDataDir: directory }),
      referenceImageProvider: provider,
      referenceImageAssetStore: new LocalReferenceImageAssetStore(directory),
    });
    applications.push(app);
    await app.listen({ host: '127.0.0.1', port: 0 });
    const address = app.server.address();
    if (address === null || typeof address === 'string') throw new Error('Missing test address.');
    const origin = `http://127.0.0.1:${address.port}`;
    const requestBody = JSON.stringify(requestPayload satisfies CreateReferenceImageRequest);

    const responseStatus = await new Promise<number | undefined>((resolve, reject) => {
      const outgoing = httpRequest(
        `${origin}/api/reference-images`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'content-length': Buffer.byteLength(requestBody),
            origin,
          },
        },
        (response) => {
          response.resume();
          response.once('end', () => resolve(response.statusCode));
        },
      );
      outgoing.once('error', reject);
      outgoing.end(requestBody);
    });

    expect(responseStatus).toBe(200);
    expect(providerSignal).toBeInstanceOf(AbortSignal);
    expect(providerSignal?.aborted).toBe(false);
  });
});
