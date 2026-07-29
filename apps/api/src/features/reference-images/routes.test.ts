import { request as httpRequest } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  ApiErrorResponse,
  CapabilitiesResponse,
  CharacterPromptOptimizationResult,
  ComposeReferenceImageResponse,
  CreateReferenceImageRequest,
  CreateReferenceImageResponse,
  EditReferenceImageResponse,
  OptimizeCharacterReferencePromptResponse,
  UploadReferenceImageResponse,
} from '@studio/contracts';
import { createApp } from '../../app.js';
import {
  CharacterPromptOptimizerError,
  type CharacterPromptOptimizer,
} from '../../providers/openai/character-prompt-optimizer.js';
import type {
  EditReferenceImageProviderInput,
  GenerateReferenceImageProviderInput,
  GeneratedReferenceImagePayload,
  ReferenceImageProvider,
} from '../../providers/openai/reference-image-provider.js';
import { ReferenceImageProviderError } from '../../providers/openai/reference-image-provider.js';
import { testConfig } from '../../test/fakes.js';
import { LocalReferenceImageAssetStore } from './asset-store.js';

const localHeaders = { origin: 'http://localhost:5173', host: 'localhost:5173' };
const requestId = '37d15fec-43a3-47b2-8330-7fb410698564';
const secondRequestId = '5f43d16c-81b7-445a-a70e-35a64a597086';

const record = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('Expected a JSON object.');
  }
  return value as Record<string, unknown>;
};

const options = {
  framing: 'head_and_shoulders',
  orientation: 'square',
  renderingMode: 'photorealistic',
  expression: 'neutral',
  background: 'neutral_gray',
  targetUse: 'lucy_2_5_character_reference',
} as const;

const optimizedResult: CharacterPromptOptimizationResult = {
  optimizedImagePrompt: '  Canonical optimized reference prompt for the moss-covered guardian.\n',
  lucy25CharacterPrompt:
    'Replace the character in the video with a moss-covered guardian. Preserve source motion naturally.',
  normalizedCharacterDescription: 'A moss-covered guardian.',
  preservedCharacterFacts: ['moss-covered guardian'],
  technicalDefaultsAdded: ['soft diffuse lighting'],
  warnings: [],
  recommendedSettings: {
    framing: 'head_and_shoulders',
    orientation: 'square',
    size: '1024x1024',
    quality: 'high',
    format: 'jpeg',
  },
};

const optimizer = (
  result: CharacterPromptOptimizationResult = optimizedResult,
): CharacterPromptOptimizer => ({
  model: 'gpt-5.6',
  version: 'lucy-character-reference-v1',
  optimize: vi.fn(() => Promise.resolve(result)),
});

const bypassPayload = (rawPrompt: string, id = requestId): CreateReferenceImageRequest => ({
  requestId: id,
  rawPrompt,
  options,
  optimization: { enabled: false },
});

const createImage = async (size: GenerateReferenceImageProviderInput['size']): Promise<Buffer> => {
  const [width, height] = size.split('x').map(Number) as [number, number];
  return sharp({ create: { width, height, channels: 3, background: '#8f6c52' } })
    .jpeg({ quality: 90 })
    .toBuffer();
};

const providerImage = (
  bytes: Uint8Array,
  format: GenerateReferenceImageProviderInput['format'] = 'jpeg',
  providerRequestId?: string,
): GeneratedReferenceImagePayload => ({
  bytes,
  mimeType: format === 'png' ? 'image/png' : format === 'webp' ? 'image/webp' : 'image/jpeg',
  providerId: 'openai',
  modelId: 'gpt-image-2',
  ...(providerRequestId === undefined ? {} : { providerRequestId }),
});

describe('reference image API', () => {
  const apps: ReturnType<typeof createApp>[] = [];
  const directories: string[] = [];
  afterEach(async () => {
    await Promise.all(apps.splice(0).map(async (app) => app.close()));
    await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
  });

  const setup = async (
    provider: ReferenceImageProvider | null,
    characterPromptOptimizer: CharacterPromptOptimizer | null = null,
  ) => {
    const directory = await mkdtemp(path.join(tmpdir(), 'lightframe-reference-api-'));
    directories.push(directory);
    const app = createApp({
      config: testConfig({ lightframeDataDir: directory }),
      referenceImageProvider: provider,
      characterPromptOptimizer,
      referenceImageAssetStore: new LocalReferenceImageAssetStore(directory),
    });
    apps.push(app);
    return app;
  };

  it('optimizes first, routes the exact optimized prompt, and returns stored Lucy audit metadata', async () => {
    const providerInputs: GenerateReferenceImageProviderInput[] = [];
    const provider: ReferenceImageProvider = {
      generate: vi.fn(async (input: GenerateReferenceImageProviderInput) => {
        providerInputs.push(input);
        return providerImage(await createImage(input.size), input.format);
      }),
    };
    const app = await setup(provider, optimizer());
    const rawPrompt = '  A moss-covered guardian.  ';

    const optimized = await app.inject({
      method: 'POST',
      url: '/api/reference-images/optimize',
      headers: localHeaders,
      payload: { rawPrompt, options },
    });
    expect(optimized.statusCode).toBe(200);
    const optimization = optimized.json<OptimizeCharacterReferencePromptResponse>();
    expect(optimization).toMatchObject({
      result: optimizedResult,
      model: 'gpt-5.6',
      version: 'lucy-character-reference-v1',
    });
    expect(optimization.inputHash).toMatch(/^[a-f0-9]{64}$/u);

    const generated = await app.inject({
      method: 'POST',
      url: '/api/reference-images',
      headers: localHeaders,
      payload: {
        requestId,
        rawPrompt,
        options,
        optimization: { enabled: true, ...optimization, manuallyEdited: false },
      },
    });

    expect(generated.statusCode).toBe(200);
    expect(providerInputs).toHaveLength(1);
    expect(providerInputs[0]).toMatchObject({
      prompt: optimizedResult.optimizedImagePrompt,
      size: '1024x1024',
      format: 'jpeg',
    });
    expect(providerInputs[0]?.signal).toBeInstanceOf(AbortSignal);
    expect(generated.json<CreateReferenceImageResponse>().asset).toMatchObject({
      optimizationEnabled: true,
      originalPrompt: 'A moss-covered guardian.',
      optimizedImagePrompt: optimizedResult.optimizedImagePrompt,
      lucy25CharacterPrompt: optimizedResult.lucy25CharacterPrompt,
      normalizedCharacterDescription: optimizedResult.normalizedCharacterDescription,
      optimizer: { model: 'gpt-5.6', version: 'lucy-character-reference-v1' },
      optimizationInputHash: optimization.inputHash,
      manuallyEdited: false,
      derivation: { kind: 'generate' },
      size: '1024x1024',
      quality: 'high',
    });
    expect(generated.body).not.toContain('storageKey');
    expect(generated.body).not.toContain('base64');
  });

  it('persists authoritative BFL provenance without exposing task or usage internals', async () => {
    const provider: ReferenceImageProvider = {
      descriptor: {
        providerId: 'bfl',
        modelId: 'flux-2-pro',
        adapterVersion: 'bfl-flux-2-pro-v1',
        effectiveSettings: {
          safetyTolerance: 4,
          disablePromptUpsampling: true,
        },
      },
      generate: vi.fn<ReferenceImageProvider['generate']>(
        async (input: GenerateReferenceImageProviderInput) => ({
          bytes: await createImage(input.size),
          mimeType: 'image/jpeg',
          providerId: 'bfl',
          modelId: 'flux-2-pro',
          providerRequestId: 'bfl-task-one',
          safeUsage: { cost: 0.05, inputMegapixels: 0, outputMegapixels: 1 },
        }),
      ),
    };
    const app = await setup(provider);

    const response = await app.inject({
      method: 'POST',
      url: '/api/reference-images',
      headers: localHeaders,
      payload: bypassPayload('A BFL-generated cartographer.'),
    });

    expect(response.statusCode).toBe(200);
    const asset = response.json<CreateReferenceImageResponse>().asset;
    expect(asset).toMatchObject({
      source: 'generated',
      provider: 'bfl',
      model: 'flux-2-pro',
    });
    expect(response.body).not.toContain('bfl-task-one');
    expect(response.body).not.toContain('providerUsage');

    const dataDirectory = directories.at(-1);
    const stored = JSON.parse(
      await readFile(
        path.join(
          dataDirectory ?? '',
          'reference-images',
          'v1',
          'assets',
          asset.assetId,
          'metadata.json',
        ),
        'utf8',
      ),
    ) as Record<string, unknown>;
    expect(stored).toMatchObject({
      provider: 'bfl',
      model: 'flux-2-pro',
      providerRequestId: 'bfl-task-one',
      requestFingerprintVersion: 2,
      providerSettings: {
        safetyTolerance: 4,
        disablePromptUpsampling: true,
      },
      providerUsage: { cost: 0.05, inputMegapixels: 0, outputMegapixels: 1 },
    });
  });

  it('persists authoritative Wiro provenance and performs post-store cleanup without exposing internals', async () => {
    const cleanupRemoteArtifacts = vi.fn().mockResolvedValue(undefined);
    const provider: ReferenceImageProvider = {
      descriptor: {
        providerId: 'wiro',
        modelId: 'seedream-v5-lite-uncensored',
        adapterVersion: 'wiro-seedream-v5-lite-v1',
        effectiveSettings: {
          owner: 'ByteDance',
          resolution: '2k',
          maxImages: 1,
          watermark: false,
        },
      },
      generate: vi.fn<ReferenceImageProvider['generate']>(
        async (input: GenerateReferenceImageProviderInput) => ({
          bytes: await createImage(input.size),
          mimeType: 'image/jpeg',
          providerId: 'wiro',
          modelId: 'seedream-v5-lite-uncensored',
          providerRequestId: 'wiro-task-one',
          safeUsage: { cost: 0.035 },
          cleanupRemoteArtifacts,
        }),
      ),
    };
    const app = await setup(provider);

    const response = await app.inject({
      method: 'POST',
      url: '/api/reference-images',
      headers: localHeaders,
      payload: bypassPayload('A Wiro-generated cartographer.'),
    });

    expect(response.statusCode).toBe(200);
    const asset = response.json<CreateReferenceImageResponse>().asset;
    expect(asset).toMatchObject({
      source: 'generated',
      provider: 'wiro',
      model: 'seedream-v5-lite-uncensored',
    });
    expect(response.body).not.toContain('wiro-task-one');
    expect(response.body).not.toContain('providerUsage');
    expect(cleanupRemoteArtifacts).toHaveBeenCalledOnce();

    const dataDirectory = directories.at(-1);
    const stored = JSON.parse(
      await readFile(
        path.join(
          dataDirectory ?? '',
          'reference-images',
          'v1',
          'assets',
          asset.assetId,
          'metadata.json',
        ),
        'utf8',
      ),
    ) as Record<string, unknown>;
    expect(stored).toMatchObject({
      provider: 'wiro',
      model: 'seedream-v5-lite-uncensored',
      providerRequestId: 'wiro-task-one',
      requestFingerprintVersion: 2,
      providerSettings: {
        owner: 'ByteDance',
        resolution: '2k',
        maxImages: 1,
        watermark: false,
      },
      providerUsage: { cost: 0.035 },
    });
  });

  it('does not cancel a pending generation when a normal POST body finishes', async () => {
    const image = await createImage('1024x1024');
    let providerSignal: AbortSignal | undefined;
    const provider: ReferenceImageProvider = {
      generate: vi.fn(
        (input: GenerateReferenceImageProviderInput) =>
          new Promise<GeneratedReferenceImagePayload>((resolve, reject) => {
            providerSignal = input.signal;
            const timer = setTimeout(() => resolve(providerImage(image, input.format)), 50);
            const abort = () => {
              clearTimeout(timer);
              reject(new ReferenceImageProviderError('aborted'));
            };
            if (input.signal?.aborted === true) abort();
            else input.signal?.addEventListener('abort', abort, { once: true });
          }),
      ),
    };
    const app = await setup(provider);
    await app.listen({ host: '127.0.0.1', port: 0 });
    const address = app.server.address();
    if (address === null || typeof address === 'string') throw new Error('Missing test address.');
    const origin = `http://127.0.0.1:${address.port}`;
    const requestBody = JSON.stringify(bypassPayload('A patient cartographer'));

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

  it('edits an owner-scoped stored image and exposes only immutable lineage metadata', async () => {
    const editInputs: EditReferenceImageProviderInput[] = [];
    const provider: ReferenceImageProvider = {
      generate: vi.fn(async (input: GenerateReferenceImageProviderInput) => ({
        ...providerImage(await createImage(input.size), input.format),
      })),
      edit: vi.fn(async (input: EditReferenceImageProviderInput) => {
        editInputs.push(input);
        return providerImage(await createImage(input.size), input.format, 'provider-edit-one');
      }),
    };
    const app = await setup(provider, optimizer());
    const capabilities = await app.inject({ method: 'GET', url: '/api/capabilities' });
    expect(capabilities.json<CapabilitiesResponse>().referenceImages.editAvailable).toBe(true);
    const rawPrompt = 'A moss-covered guardian.';
    const optimized = await app.inject({
      method: 'POST',
      url: '/api/reference-images/optimize',
      headers: localHeaders,
      payload: { rawPrompt, options },
    });
    const optimization = optimized.json<OptimizeCharacterReferencePromptResponse>();
    const sourceResponse = await app.inject({
      method: 'POST',
      url: '/api/reference-images',
      headers: localHeaders,
      payload: {
        requestId,
        rawPrompt,
        options,
        optimization: { enabled: true, ...optimization, manuallyEdited: false },
      },
    });
    const sourceAssetId = sourceResponse.json<CreateReferenceImageResponse>().asset.assetId;
    const changeInstructions = 'Change only the coat to green.';
    const editPayload = {
      requestId: secondRequestId,
      rawPrompt,
      changeInstructions,
      options,
      optimization: { enabled: true as const, ...optimization, manuallyEdited: false },
    };

    const edited = await app.inject({
      method: 'POST',
      url: `/api/reference-images/${sourceAssetId}/edits`,
      headers: localHeaders,
      payload: editPayload,
    });

    expect(edited.statusCode).toBe(200);
    expect(editInputs).toHaveLength(1);
    expect(editInputs[0]).toMatchObject({
      source: { mimeType: 'image/jpeg' },
      size: '1024x1024',
      format: 'jpeg',
    });
    expect(editInputs[0]?.source.bytes.byteLength).toBeGreaterThan(0);
    expect(editInputs[0]?.prompt).toContain(optimizedResult.optimizedImagePrompt.trim());
    expect(editInputs[0]?.prompt).toContain(changeInstructions);
    expect(edited.json<EditReferenceImageResponse>().asset).toMatchObject({
      derivation: { kind: 'edit', sourceAssetId },
      originalPrompt: rawPrompt,
      optimizedImagePrompt: optimizedResult.optimizedImagePrompt,
    });
    expect(edited.body).not.toContain(changeInstructions);
    expect(edited.body).not.toContain('provider-edit-one');
    const editedAssetId = edited.json<EditReferenceImageResponse>().asset.assetId;
    const dataDirectory = directories[0];
    expect(dataDirectory).toBeDefined();
    const storedMetadata = await readFile(
      path.join(
        dataDirectory ?? '',
        'reference-images',
        'v1',
        'assets',
        editedAssetId,
        'metadata.json',
      ),
      'utf8',
    );
    expect(storedMetadata).not.toContain(changeInstructions);
    const storedMetadataJson: unknown = JSON.parse(storedMetadata);
    const storedMetadataRecord = record(storedMetadataJson);
    const derivation = record(storedMetadataRecord.derivation);
    expect(storedMetadataRecord.requestFingerprint).toMatch(/^[a-f0-9]{64}$/u);
    expect(derivation).toMatchObject({ kind: 'edit', sourceAssetId });
    expect(derivation.changeInstructionsHash).toMatch(/^[a-f0-9]{64}$/u);

    const replay = await app.inject({
      method: 'POST',
      url: `/api/reference-images/${sourceAssetId}/edits`,
      headers: localHeaders,
      payload: editPayload,
    });
    const conflict = await app.inject({
      method: 'POST',
      url: `/api/reference-images/${sourceAssetId}/edits`,
      headers: localHeaders,
      payload: { ...editPayload, changeInstructions: 'Change only the coat to blue.' },
    });
    expect(replay.json()).toEqual(edited.json());
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json<ApiErrorResponse>().error.code).toBe('request_id_conflict');

    const otherOwner = await app.inject({
      method: 'POST',
      url: `/api/reference-images/${sourceAssetId}/edits`,
      headers: { origin: 'http://127.0.0.1:5173', host: '127.0.0.1:5173' },
      payload: {
        ...editPayload,
        requestId: 'b83f42c1-0111-44af-a31b-d847771acd27',
      },
    });
    expect(otherOwner.statusCode).toBe(404);
    expect(otherOwner.json<ApiErrorResponse>().error).toMatchObject({
      code: 'not_found',
      message: 'That local reference image is unavailable.',
    });
    expect(provider.edit).toHaveBeenCalledTimes(1);
  });

  it('stores validated uploads immutably and replays only identical idempotent requests', async () => {
    const app = await setup(null);
    const bytes = await sharp({
      create: { width: 320, height: 480, channels: 3, background: '#234f61' },
    })
      .png()
      .toBuffer();
    const headers = {
      ...localHeaders,
      'content-type': 'image/png',
      'idempotency-key': requestId,
    };

    const uploaded = await app.inject({
      method: 'POST',
      url: '/api/reference-images/uploads',
      headers,
      payload: bytes,
    });
    const replay = await app.inject({
      method: 'POST',
      url: '/api/reference-images/uploads',
      headers,
      payload: bytes,
    });
    const conflict = await app.inject({
      method: 'POST',
      url: '/api/reference-images/uploads',
      headers,
      payload: await sharp(bytes).jpeg().toBuffer(),
    });
    const uploadedAsset = uploaded.json<UploadReferenceImageResponse>().asset;
    const content = await app.inject({
      method: 'GET',
      url: uploadedAsset.contentUrl,
      headers: localHeaders,
    });
    const otherOwner = await app.inject({
      method: 'GET',
      url: uploadedAsset.contentUrl,
      headers: { origin: 'http://127.0.0.1:5173', host: '127.0.0.1:5173' },
    });

    expect(uploaded.statusCode).toBe(200);
    expect(uploadedAsset).toMatchObject({
      source: 'uploaded',
      mimeType: 'image/png',
      width: 320,
      height: 480,
      byteSize: bytes.byteLength,
    });
    expect(uploaded.body).not.toContain('provider');
    expect(uploaded.body).not.toContain('originalPrompt');
    expect(replay.json()).toEqual(uploaded.json());
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json<ApiErrorResponse>().error.code).toBe('request_id_conflict');
    expect(content.statusCode).toBe(200);
    expect(content.headers['content-type']).toBe('image/png');
    expect(content.rawPayload).toEqual(bytes);
    expect(otherOwner.statusCode).toBe(404);
  });

  it('rejects invalid upload bytes and requires trusted, typed, idempotent requests', async () => {
    const app = await setup(null);
    const invalid = await app.inject({
      method: 'POST',
      url: '/api/reference-images/uploads',
      headers: {
        ...localHeaders,
        'content-type': 'image/png',
        'idempotency-key': requestId,
      },
      payload: Buffer.from('not an image'),
    });
    const missingKey = await app.inject({
      method: 'POST',
      url: '/api/reference-images/uploads',
      headers: { ...localHeaders, 'content-type': 'image/png' },
      payload: Buffer.from('not an image'),
    });
    const untrusted = await app.inject({
      method: 'POST',
      url: '/api/reference-images/uploads',
      headers: {
        origin: 'https://example.com',
        host: 'localhost:5173',
        'content-type': 'image/png',
        'idempotency-key': secondRequestId,
      },
      payload: Buffer.from('not an image'),
    });
    const unsupportedMime = await app.inject({
      method: 'POST',
      url: '/api/reference-images/uploads',
      headers: {
        ...localHeaders,
        'content-type': 'image/gif',
        'idempotency-key': secondRequestId,
      },
      payload: Buffer.from('GIF89a'),
    });
    const oversized = await app.inject({
      method: 'POST',
      url: '/api/reference-images/uploads',
      headers: {
        ...localHeaders,
        'content-type': 'image/png',
        'idempotency-key': secondRequestId,
      },
      payload: Buffer.alloc(10 * 1024 * 1024 + 1),
    });

    expect(invalid.statusCode).toBe(400);
    expect(invalid.json<ApiErrorResponse>().error.code).toBe('invalid_image_upload');
    expect(missingKey.statusCode).toBe(400);
    expect(untrusted.statusCode).toBe(403);
    expect(unsupportedMime.statusCode).toBe(415);
    expect(oversized.statusCode).toBe(413);
  });

  it('composes a generated preview from an uploaded source and records source provenance', async () => {
    const editInputs: EditReferenceImageProviderInput[] = [];
    const provider: ReferenceImageProvider = {
      generate: vi.fn(),
      edit: vi.fn(async (input: EditReferenceImageProviderInput) => {
        editInputs.push(input);
        return providerImage(await createImage(input.size), input.format);
      }),
    };
    const app = await setup(provider, optimizer());
    const sourceBytes = await sharp({
      create: { width: 480, height: 640, channels: 3, background: '#594233' },
    })
      .webp()
      .toBuffer();
    const upload = await app.inject({
      method: 'POST',
      url: '/api/reference-images/uploads',
      headers: {
        ...localHeaders,
        'content-type': 'image/webp',
        'idempotency-key': requestId,
      },
      payload: sourceBytes,
    });
    const sourceAssetId = upload.json<UploadReferenceImageResponse>().asset.assetId;
    const rawPrompt = 'A moss-covered guardian.';
    const optimized = await app.inject({
      method: 'POST',
      url: '/api/reference-images/optimize',
      headers: localHeaders,
      payload: { rawPrompt, options },
    });
    const optimization = optimized.json<OptimizeCharacterReferencePromptResponse>();
    const composed = await app.inject({
      method: 'POST',
      url: `/api/reference-images/${sourceAssetId}/compositions`,
      headers: localHeaders,
      payload: {
        requestId: secondRequestId,
        rawPrompt,
        options,
        optimization: { enabled: true, ...optimization, manuallyEdited: false },
      },
    });

    expect(composed.statusCode).toBe(200);
    expect(editInputs).toHaveLength(1);
    expect(editInputs[0]).toMatchObject({
      source: { mimeType: 'image/webp' },
      size: '1024x1024',
    });
    expect(editInputs[0]?.source.bytes).toEqual(sourceBytes);
    expect(editInputs[0]?.prompt).toContain('Preserve the recognizable person or character');
    expect(composed.json<ComposeReferenceImageResponse>().asset).toMatchObject({
      source: 'generated',
      derivation: { kind: 'compose', sourceAssetId },
      originalPrompt: rawPrompt,
    });
  });

  it('sends the raw prompt when optimization is explicitly disabled', async () => {
    const inputs: GenerateReferenceImageProviderInput[] = [];
    const app = await setup({
      generate: vi.fn(async (input: GenerateReferenceImageProviderInput) => {
        inputs.push(input);
        return providerImage(await createImage(input.size), input.format);
      }),
    });

    const generated = await app.inject({
      method: 'POST',
      url: '/api/reference-images',
      headers: localHeaders,
      payload: bypassPayload('A clockwork character'),
    });

    expect(generated.statusCode).toBe(200);
    expect(inputs[0]?.prompt).toBe('A clockwork character');
    expect(generated.json<CreateReferenceImageResponse>().asset).toMatchObject({
      optimizationEnabled: false,
      lucy25CharacterPrompt: 'A clockwork character',
      optimizer: null,
    });
  });

  it('uses the known landscape size without rewriting the raw fallback prompt', async () => {
    const inputs: GenerateReferenceImageProviderInput[] = [];
    const app = await setup({
      generate: vi.fn(async (input: GenerateReferenceImageProviderInput) => {
        inputs.push(input);
        return providerImage(await createImage(input.size), input.format);
      }),
    });

    const generated = await app.inject({
      method: 'POST',
      url: '/api/reference-images',
      headers: localHeaders,
      payload: {
        ...bypassPayload('A clockwork character'),
        options: { ...options, framing: 'full_body', orientation: 'auto' },
      },
    });

    expect(generated.statusCode).toBe(200);
    expect(inputs[0]).toMatchObject({ size: '1536x1024' });
    expect(inputs[0]?.prompt).toBe('A clockwork character');
  });

  it('blocks stale fingerprints, changed models, and contradictory settings before image generation', async () => {
    const generate = vi.fn<ReferenceImageProvider['generate']>();
    const app = await setup({ generate }, optimizer());
    const optimized = await app.inject({
      method: 'POST',
      url: '/api/reference-images/optimize',
      headers: localHeaders,
      payload: { rawPrompt: 'A coral explorer', options },
    });
    const response = optimized.json<OptimizeCharacterReferencePromptResponse>();
    const base = {
      requestId,
      rawPrompt: 'A coral explorer',
      options,
      optimization: { enabled: true as const, ...response, manuallyEdited: false },
    };

    const stale = await app.inject({
      method: 'POST',
      url: '/api/reference-images',
      headers: localHeaders,
      payload: { ...base, rawPrompt: 'A changed coral explorer' },
    });
    const wrongModel = await app.inject({
      method: 'POST',
      url: '/api/reference-images',
      headers: localHeaders,
      payload: {
        ...base,
        requestId: secondRequestId,
        optimization: { ...base.optimization, model: 'different-model' },
      },
    });
    const contradictory = await app.inject({
      method: 'POST',
      url: '/api/reference-images',
      headers: localHeaders,
      payload: {
        ...base,
        requestId: 'c048a9a8-c04b-4d1a-a9de-37489864f659',
        optimization: {
          ...base.optimization,
          result: {
            ...base.optimization.result,
            recommendedSettings: {
              ...base.optimization.result.recommendedSettings,
              framing: 'full_body',
            },
          },
        },
      },
    });
    const wrongQuality = await app.inject({
      method: 'POST',
      url: '/api/reference-images',
      headers: localHeaders,
      payload: {
        ...base,
        requestId: '7e7ebc99-9bb2-4ec9-9863-76540e97396c',
        optimization: {
          ...base.optimization,
          result: {
            ...base.optimization.result,
            recommendedSettings: {
              ...base.optimization.result.recommendedSettings,
              quality: 'medium',
            },
          },
        },
      },
    });

    expect(stale.statusCode).toBe(409);
    expect(wrongModel.statusCode).toBe(409);
    expect(contradictory.statusCode).toBe(400);
    expect(wrongQuality.statusCode).toBe(400);
    expect(generate).not.toHaveBeenCalled();
  });

  it('resolves auto orientation to the known landscape target stream', async () => {
    const autoOptions = { ...options, orientation: 'auto' as const };
    const landscapeOptimizer = optimizer({
      ...optimizedResult,
      recommendedSettings: {
        framing: 'head_and_shoulders',
        orientation: 'landscape',
        size: '1536x1024',
        quality: 'high',
        format: 'jpeg',
      },
    });
    const app = await setup({ generate: vi.fn() }, landscapeOptimizer);

    const response = await app.inject({
      method: 'POST',
      url: '/api/reference-images/optimize',
      headers: localHeaders,
      payload: { rawPrompt: 'A character', options: autoOptions },
    });

    expect(response.statusCode).toBe(200);
    expect(
      response.json<OptimizeCharacterReferencePromptResponse>().result.recommendedSettings,
    ).toMatchObject({
      orientation: 'landscape',
      size: '1536x1024',
    });
  });

  it('persistently replays a request ID and coalesces a duplicate in flight', async () => {
    const image = await createImage('1024x1024');
    let finish: ((payload: GeneratedReferenceImagePayload) => void) | undefined;
    const generate = vi.fn(
      (_input: GenerateReferenceImageProviderInput) =>
        new Promise<GeneratedReferenceImagePayload>((resolve) => {
          finish = resolve;
        }),
    );
    const app = await setup({ generate });
    const payload = bypassPayload('A coral explorer');
    const first = app.inject({
      method: 'POST',
      url: '/api/reference-images',
      headers: localHeaders,
      payload,
    });
    await vi.waitFor(() => expect(generate).toHaveBeenCalledTimes(1));
    const duplicate = app.inject({
      method: 'POST',
      url: '/api/reference-images',
      headers: localHeaders,
      payload,
    });
    finish?.(providerImage(image));
    const firstResponse = await first;
    const duplicateResponse = await duplicate;
    const replay = await app.inject({
      method: 'POST',
      url: '/api/reference-images',
      headers: localHeaders,
      payload,
    });
    const conflict = await app.inject({
      method: 'POST',
      url: '/api/reference-images',
      headers: localHeaders,
      payload: bypassPayload('A different prompt cannot change this request'),
    });

    expect(firstResponse.statusCode).toBe(200);
    expect(duplicateResponse.json()).toEqual(firstResponse.json());
    expect(replay.json()).toEqual(firstResponse.json());
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json<ApiErrorResponse>().error.code).toBe('request_id_conflict');
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('serializes operations per owner without blocking a different local owner', async () => {
    const image = await createImage('1024x1024');
    let finishFirst: ((payload: GeneratedReferenceImagePayload) => void) | undefined;
    const generate = vi
      .fn<ReferenceImageProvider['generate']>()
      .mockImplementationOnce(
        () =>
          new Promise<GeneratedReferenceImagePayload>((resolve) => {
            finishFirst = resolve;
          }),
      )
      .mockResolvedValueOnce(providerImage(image));
    const app = await setup({ generate });
    const first = app.inject({
      method: 'POST',
      url: '/api/reference-images',
      headers: localHeaders,
      payload: bypassPayload('Owner one character'),
    });
    await vi.waitFor(() => expect(generate).toHaveBeenCalledTimes(1));

    const otherOwner = await app.inject({
      method: 'POST',
      url: '/api/reference-images',
      headers: { origin: 'http://127.0.0.1:5173', host: '127.0.0.1:5173' },
      payload: bypassPayload('Owner two character', secondRequestId),
    });

    expect(otherOwner.statusCode).toBe(200);
    expect(generate).toHaveBeenCalledTimes(2);
    finishFirst?.(providerImage(image));
    await expect(first).resolves.toMatchObject({ statusCode: 200 });
  });

  it('releases generation after provider failure and normalizes configuration safely', async () => {
    const image = await createImage('1024x1024');
    const generate = vi
      .fn<ReferenceImageProvider['generate']>()
      .mockRejectedValueOnce(new ReferenceImageProviderError('failure', { upstreamStatus: 502 }))
      .mockResolvedValueOnce(providerImage(image));
    const app = await setup({ generate });

    const failed = await app.inject({
      method: 'POST',
      url: '/api/reference-images',
      headers: localHeaders,
      payload: bypassPayload('A coral explorer'),
    });
    const retry = await app.inject({
      method: 'POST',
      url: '/api/reference-images',
      headers: localHeaders,
      payload: bypassPayload('A silver explorer', secondRequestId),
    });
    const unconfigured = await setup(null, null);
    const noOptimizer = await unconfigured.inject({
      method: 'POST',
      url: '/api/reference-images/optimize',
      headers: localHeaders,
      payload: { rawPrompt: 'A character', options },
    });

    expect(failed.statusCode).toBe(502);
    expect(failed.json<ApiErrorResponse>().error).toMatchObject({
      code: 'provider_failure',
      upstreamStatus: 502,
    });
    expect(retry.statusCode).toBe(200);
    expect(noOptimizer.statusCode).toBe(503);
    expect(noOptimizer.json<ApiErrorResponse>().error.code).toBe('provider_configuration');
  });

  it.each([
    ['aborted', 499, 'request_aborted'],
    ['authentication', 502, 'provider_authentication'],
    ['connection', 502, 'provider_failure'],
    ['rate-limit', 429, 'rate_limited'],
    ['timeout', 504, 'request_timeout'],
    ['refusal', 400, 'moderation_blocked'],
    ['invalid-response', 502, 'provider_failure'],
    ['failure', 502, 'provider_failure'],
  ] as const)('normalizes optimizer %s failures', async (reason, status, code) => {
    const characterPromptOptimizer: CharacterPromptOptimizer = {
      model: 'gpt-5.6',
      version: 'lucy-character-reference-v1',
      optimize: () => Promise.reject(new CharacterPromptOptimizerError(reason)),
    };
    const app = await setup({ generate: vi.fn() }, characterPromptOptimizer);

    const response = await app.inject({
      method: 'POST',
      url: '/api/reference-images/optimize',
      headers: localHeaders,
      payload: { rawPrompt: 'A character', options },
    });

    expect(response.statusCode).toBe(status);
    expect(response.json<ApiErrorResponse>().error.code).toBe(code);
    expect(response.body).not.toContain('OpenAI character prompt optimization failed');
  });
});
