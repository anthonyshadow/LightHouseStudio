import { createHash } from 'node:crypto';
import type { Page } from '@playwright/test';
import type {
  CreateReferenceImageRequest,
  EditReferenceImageRequest,
  OptimizeCharacterReferencePromptRequest,
  OptimizeCharacterReferencePromptResponse,
} from '@studio/contracts';
import type {
  MockReferenceImageAsset,
  ModelId,
  NetworkJourneyState,
  StudioHarnessOptions,
} from './studioHarness.types.js';

// A valid one-pixel PNG. Browser-side image validation is deterministically
// stubbed to 1024x1024 by the harness, so these bytes exercise the complete
// fetch/File handoff while keeping the fixture tiny and fast.
const REFERENCE_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const REFERENCE_PNG = Buffer.from(REFERENCE_PNG_BASE64, 'base64');

const createReplacementVoiceWav = (): Buffer => {
  const sampleRate = 48_000;
  const sampleCount = 9_600;
  const bytesPerSample = 2;
  const dataBytes = sampleCount * bytesPerSample;
  const wav = Buffer.alloc(44 + dataBytes);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(36 + dataBytes, 4);
  wav.write('WAVE', 8);
  wav.write('fmt ', 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * bytesPerSample, 28);
  wav.writeUInt16LE(bytesPerSample, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(dataBytes, 40);
  for (let index = 0; index < sampleCount; index += 1) {
    const sample = Math.sin((index / sampleRate) * Math.PI * 440) * 0.08;
    wav.writeInt16LE(Math.round(sample * 32_767), 44 + index * bytesPerSample);
  }
  return wav;
};

const REPLACEMENT_VOICE_WAV = createReplacementVoiceWav();

const canonicalPrompt = (value: string): string =>
  value.replace(/\s+/gu, ' ').trim().slice(0, 4_000).toLocaleLowerCase('en-US');

const promptHash = (value: string): string =>
  createHash('sha256').update(canonicalPrompt(value), 'utf8').digest('hex');

const assetIdForSequence = (sequence: number): string =>
  `00000000-0000-4000-8000-${sequence.toString().padStart(12, '0')}`;

const IMAGE_LAYOUT_BY_ORIENTATION = {
  auto: { orientation: 'landscape', size: '1536x1024' },
  portrait_9_16: { orientation: 'portrait', size: '1024x1536' },
  landscape_16_9: { orientation: 'landscape', size: '1536x1024' },
  square: { orientation: 'square', size: '1024x1024' },
} as const;

const IMAGE_DIMENSIONS_BY_SIZE = {
  '1024x1024': { size: '1024x1024', width: 1024, height: 1024 },
  '1024x1536': { size: '1024x1536', width: 1024, height: 1536 },
  '1536x1024': { size: '1536x1024', width: 1536, height: 1024 },
} as const;

const createMockReferenceAsset = (
  sequence: number,
  request: CreateReferenceImageRequest,
): MockReferenceImageAsset => {
  const assetId = assetIdForSequence(sequence);
  const optimization = request.optimization;
  const generationPrompt = optimization.enabled
    ? optimization.result.optimizedImagePrompt
    : request.rawPrompt;
  const recommendedSettings = optimization.enabled
    ? optimization.result.recommendedSettings
    : {
        orientation: 'square' as const,
        size: '1024x1024' as const,
        quality: 'high' as const,
        format: 'png' as const,
      };
  return {
    assetId,
    mimeType: 'image/png',
    ...IMAGE_DIMENSIONS_BY_SIZE[recommendedSettings.size],
    byteSize: REFERENCE_PNG.byteLength,
    source: 'generated',
    provider: 'openai',
    model: request.generator?.model ?? 'gpt-image-2',
    quality: recommendedSettings.quality,
    promptHash: promptHash(request.rawPrompt),
    optimizationEnabled: optimization.enabled,
    originalPrompt: request.rawPrompt,
    optimizedImagePrompt: generationPrompt,
    lucy25CharacterPrompt: optimization.enabled
      ? optimization.result.lucy25CharacterPrompt
      : request.rawPrompt,
    normalizedCharacterDescription: optimization.enabled
      ? optimization.result.normalizedCharacterDescription
      : request.rawPrompt,
    preservedCharacterFacts: optimization.enabled
      ? optimization.result.preservedCharacterFacts
      : [request.rawPrompt],
    technicalDefaultsAdded: optimization.enabled ? optimization.result.technicalDefaultsAdded : [],
    warnings: optimization.enabled ? optimization.result.warnings : [],
    options: request.options,
    requestedGenerator: request.generator ?? null,
    optimizer: optimization.enabled
      ? { model: optimization.model, version: optimization.version }
      : null,
    optimizationInputHash: optimization.enabled ? optimization.inputHash : null,
    manuallyEdited: optimization.enabled && optimization.manuallyEdited,
    createdAt: '2030-01-01T00:00:00.000Z',
    updatedAt: '2030-01-01T00:00:00.000Z',
    contentUrl: `/api/reference-images/${assetId}/content`,
  };
};

const createOptimizationResponse = (
  request: OptimizeCharacterReferencePromptRequest,
): OptimizeCharacterReferencePromptResponse => {
  const normalized = request.rawPrompt.replace(/\s+/gu, ' ').trim();
  const recommendedSettings = {
    framing: request.options.framing,
    ...IMAGE_LAYOUT_BY_ORIENTATION[request.options.orientation],
    quality: 'high' as const,
    format: 'png' as const,
  };
  return {
    result: {
      optimizedImagePrompt: `Canonical single-character reference image optimized for Decart Lucy 2.5 character transformation. Character: ${normalized} Centered, front-facing, eye-level, with clearly visible defining features, soft diffuse lighting, sharp natural detail, and a plain uncluttered background. Exactly one character; no watermark, caption, unrelated text, or background clutter.`,
      lucy25CharacterPrompt: `Replace the character in the video with ${normalized} Preserve the source motion, expression, pose, and camera framing with natural tracking.`,
      normalizedCharacterDescription: normalized,
      preservedCharacterFacts: [normalized],
      technicalDefaultsAdded: [
        'Centered front-facing pose',
        'Soft diffuse lighting',
        'Plain uncluttered background',
      ],
      warnings: [],
      recommendedSettings,
    },
    model: 'gpt-5.6',
    version: 'lucy-character-reference-v1',
    inputHash: createHash('sha256').update(JSON.stringify(request), 'utf8').digest('hex'),
  };
};

export const installProviderNetworkDriver = async (
  page: Page,
  options: StudioHarnessOptions = {},
): Promise<NetworkJourneyState> => {
  let remainingCapabilityFailures = options.capabilityFailuresBeforeSuccess ?? 0;
  const network: NetworkJourneyState = {
    apiRequests: [],
    referenceWorkflowCalls: [],
    referencePromptOptimizations: [],
    referenceImageGenerations: [],
    referenceImageEdits: [],
    referenceImageMetadataReads: [],
    referenceImageContentReads: [],
    blockedExternalRequests: [],
    blockedExternalWebSockets: [],
    setCapabilityFailuresRemaining: (count) => {
      remainingCapabilityFailures = Math.max(0, Math.trunc(count));
    },
  };
  const assets = new Map<string, MockReferenceImageAsset>();
  const assetsByRequestId = new Map<string, MockReferenceImageAsset>();
  let assetSequence = 0;

  await page.routeWebSocket(
    (url) => !['127.0.0.1', 'localhost'].includes(url.hostname),
    async (webSocket) => {
      network.blockedExternalWebSockets.push(webSocket.url());
      await webSocket.close({ code: 1008, reason: 'External sockets are blocked in e2e.' });
    },
  );

  await page.route('**/*', async (route) => {
    const requestUrl = new URL(route.request().url());
    const isLocal =
      ['127.0.0.1', 'localhost'].includes(requestUrl.hostname) ||
      (requestUrl.protocol === 'blob:' &&
        ['http://127.0.0.1:4173', 'http://localhost:4173'].includes(requestUrl.origin));
    if (!isLocal) {
      network.blockedExternalRequests.push(requestUrl.href);
      await route.abort('blockedbyclient');
      return;
    }

    if (requestUrl.pathname === '/api/capabilities') {
      network.apiRequests.push({ path: requestUrl.pathname, model: null });
      if (remainingCapabilityFailures > 0) {
        remainingCapabilityFailures -= 1;
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({
            error: { code: 'capabilities-starting', message: 'The local API is still starting.' },
          }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          realtimeVideo: { available: true, models: ['lucy-2.5', 'lucy-vton-3'] },
          elevenLabs: {
            available: options.elevenLabsAvailable ?? false,
            modelId: options.elevenLabsAvailable ? 'eleven_multilingual_sts_v2' : null,
          },
          referenceImages: {
            available: options.referenceImagesAvailable ?? true,
            editAvailable: options.referenceImagesAvailable ?? true,
            modelId: 'gpt-image-2',
            sizes: ['1024x1024', '1024x1536', '1536x1024'],
            quality: 'high',
            optimizer: {
              available: options.referenceImagesAvailable ?? true,
              model: 'gpt-5.6',
              version: 'lucy-character-reference-v1',
            },
          },
        }),
      });
      return;
    }

    if (
      requestUrl.pathname === '/api/reference-images/optimize' &&
      route.request().method() === 'POST'
    ) {
      const request = route.request().postDataJSON() as OptimizeCharacterReferencePromptRequest;
      const response = createOptimizationResponse(request);
      network.apiRequests.push({ path: requestUrl.pathname, model: null });
      network.referenceWorkflowCalls.push('optimize');
      network.referencePromptOptimizations.push({ request, response });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(response),
      });
      return;
    }

    if (requestUrl.pathname === '/api/reference-images' && route.request().method() === 'POST') {
      const payload = route.request().postDataJSON() as CreateReferenceImageRequest;
      let asset = assetsByRequestId.get(payload.requestId);
      if (!asset) {
        assetSequence += 1;
        asset = createMockReferenceAsset(assetSequence, payload);
        assetsByRequestId.set(payload.requestId, asset);
        assets.set(asset.assetId, asset);
      }
      network.apiRequests.push({ path: requestUrl.pathname, model: null });
      network.referenceWorkflowCalls.push('generate');
      network.referenceImageGenerations.push({
        ...payload,
        assetId: asset.assetId,
        imagePromptSentToProvider: asset.optimizedImagePrompt,
      });
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ asset }),
      });
      return;
    }

    const editMatch = requestUrl.pathname.match(/^\/api\/reference-images\/([0-9a-f-]+)\/edits$/u);
    if (editMatch && route.request().method() === 'POST') {
      const sourceAssetId = editMatch[1] ?? '';
      const payload = route.request().postDataJSON() as EditReferenceImageRequest;
      const source = assets.get(sourceAssetId);
      if (!source) {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({
            error: { code: 'not_found', message: 'That local reference image is unavailable.' },
          }),
        });
        return;
      }
      let asset = assetsByRequestId.get(payload.requestId);
      if (!asset) {
        assetSequence += 1;
        asset = {
          ...createMockReferenceAsset(assetSequence, payload),
          derivation: { kind: 'edit', sourceAssetId },
        };
        assetsByRequestId.set(payload.requestId, asset);
        assets.set(asset.assetId, asset);
      }
      network.apiRequests.push({ path: requestUrl.pathname, model: null });
      network.referenceWorkflowCalls.push('edit');
      network.referenceImageEdits.push({
        ...payload,
        sourceAssetId,
        assetId: asset.assetId,
        imagePromptSentToProvider: asset.optimizedImagePrompt,
      });
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ asset }),
      });
      return;
    }

    const metadataMatch = requestUrl.pathname.match(/^\/api\/reference-images\/([0-9a-f-]+)$/u);
    if (metadataMatch) {
      const assetId = metadataMatch[1] ?? '';
      network.apiRequests.push({ path: requestUrl.pathname, model: null });
      network.referenceImageMetadataReads.push(assetId);
      const asset = assets.get(assetId);
      if (!asset) {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({
            error: {
              code: 'not_found',
              message: 'That local reference image is no longer available.',
            },
          }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(asset),
      });
      return;
    }

    const contentMatch = requestUrl.pathname.match(
      /^\/api\/reference-images\/([0-9a-f-]+)\/content$/u,
    );
    if (contentMatch) {
      const assetId = contentMatch[1] ?? '';
      network.apiRequests.push({ path: requestUrl.pathname, model: null });
      network.referenceImageContentReads.push(assetId);
      if (!assets.has(assetId)) {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({
            error: {
              code: 'not_found',
              message: 'That local reference image is no longer available.',
            },
          }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: REFERENCE_PNG,
      });
      return;
    }

    if (requestUrl.pathname === '/api/realtime-token') {
      const payload = route.request().postDataJSON() as { model: ModelId };
      network.apiRequests.push({ path: requestUrl.pathname, model: payload.model });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          apiKey: 'short-lived-e2e-browser-token',
          expiresAt: '2030-01-01T00:00:00.000Z',
          constraints: { model: payload.model, maxSessionDurationSeconds: 300 },
        }),
      });
      return;
    }

    if (requestUrl.pathname === '/api/elevenlabs/voices' && route.request().method() === 'GET') {
      network.apiRequests.push({ path: requestUrl.pathname, model: null });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          voices: [
            {
              voiceId: 'northstar-narrator',
              name: 'Northstar Narrator',
              category: 'professional',
              description: 'Warm, grounded documentary narration',
              labels: { style: 'narration' },
              previewAvailable: false,
            },
          ],
          hasMore: false,
          nextPageToken: null,
          total: 1,
        }),
      });
      return;
    }

    if (
      requestUrl.pathname === '/api/elevenlabs/voice-changer/recording' &&
      route.request().method() === 'POST'
    ) {
      network.apiRequests.push({ path: requestUrl.pathname, model: null });
      await route.fulfill({
        status: 200,
        contentType: 'audio/wav',
        body: REPLACEMENT_VOICE_WAV,
      });
      return;
    }

    if (requestUrl.pathname.startsWith('/api/')) {
      network.apiRequests.push({ path: requestUrl.pathname, model: null });
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'unexpected-test-request', message: 'Unexpected API call in e2e.' },
        }),
      });
      return;
    }

    await route.continue();
  });

  return network;
};
