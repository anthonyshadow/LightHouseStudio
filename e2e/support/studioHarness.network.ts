import { createHash } from 'node:crypto';
import type { Page } from '@playwright/test';
import type {
  ComposeReferenceImageRequest,
  CreateReferenceImageRequest,
  DerivedReferenceImageAsset,
  EditReferenceImageRequest,
  GeneratedReferenceImageAsset,
  OptimizeCharacterReferencePromptRequest,
  OptimizeCharacterReferencePromptResponse,
  OutfitTryOnRequest,
  SavedVideoDetail,
  UploadedReferenceImageAsset,
} from '@studio/contracts';
import { TEST_AUTH_SESSION, TEST_DEMO_CONFIG } from './authFixture.js';
import { REFERENCE_PNG } from './mediaFixtures.js';
import type {
  MockReferenceImageAsset,
  ModelId,
  NetworkJourneyState,
  StudioHarnessOptions,
} from './studioHarness.types.js';

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
  request: CreateReferenceImageRequest | ComposeReferenceImageRequest | EditReferenceImageRequest,
): GeneratedReferenceImageAsset => {
  const assetId = assetIdForSequence(sequence);
  const optimization = request.optimization;
  const sourcePrompt =
    'rawPrompt' in request
      ? request.rawPrompt
      : 'The selected source image is the authoritative character reference.';
  const generationPrompt = optimization.enabled
    ? optimization.result.optimizedImagePrompt
    : sourcePrompt;
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
    promptHash: promptHash(sourcePrompt),
    optimizationEnabled: optimization.enabled,
    originalPrompt: sourcePrompt,
    optimizedImagePrompt: generationPrompt,
    lucy25CharacterPrompt: optimization.enabled
      ? optimization.result.lucy25CharacterPrompt
      : sourcePrompt,
    normalizedCharacterDescription: optimization.enabled
      ? optimization.result.normalizedCharacterDescription
      : sourcePrompt,
    preservedCharacterFacts: optimization.enabled
      ? optimization.result.preservedCharacterFacts
      : [sourcePrompt],
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
  let sharedVoiceSaved = false;
  let savedVideoSequence = 0;
  const savedVideos = new Map<string, SavedVideoDetail>();
  const network: NetworkJourneyState = {
    apiRequests: [],
    voiceRequests: [],
    referenceWorkflowCalls: [],
    referenceImageUploads: [],
    referencePromptOptimizations: [],
    referenceImageGenerations: [],
    referenceImageEdits: [],
    referenceImageCompositions: [],
    outfitTryOns: [],
    referenceImageMetadataReads: [],
    referenceImageContentReads: [],
    providerSdkRequests: [],
    blockedExternalRequests: [],
    blockedExternalWebSockets: [],
    setCapabilityFailuresRemaining: (count) => {
      remainingCapabilityFailures = Math.max(0, Math.trunc(count));
    },
  };
  const assets = new Map<string, MockReferenceImageAsset>();
  const generatedAssetsByRequestId = new Map<string, GeneratedReferenceImageAsset>();
  const uploadedAssetsByRequestId = new Map<string, UploadedReferenceImageAsset>();
  const outfitAssetsByRequestId = new Map<string, DerivedReferenceImageAsset>();
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
    if (requestUrl.pathname.toLowerCase().includes('@decartai')) {
      network.providerSdkRequests.push(requestUrl.href);
    }
    const isLocal =
      ['127.0.0.1', 'localhost'].includes(requestUrl.hostname) ||
      (requestUrl.protocol === 'blob:' &&
        ['http://127.0.0.1:4173', 'http://localhost:4173'].includes(requestUrl.origin));
    if (!isLocal) {
      network.blockedExternalRequests.push(requestUrl.href);
      await route.abort('blockedbyclient');
      return;
    }

    if (requestUrl.pathname === '/api/auth/me' && route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(TEST_AUTH_SESSION),
      });
      return;
    }

    if (requestUrl.pathname === '/api/auth/demo-config' && route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(TEST_DEMO_CONFIG),
      });
      return;
    }

    if (requestUrl.pathname === '/api/auth/login' && route.request().method() === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(TEST_AUTH_SESSION),
      });
      return;
    }

    if (requestUrl.pathname === '/api/auth/logout' && route.request().method() === 'POST') {
      await route.fulfill({ status: 204, body: '' });
      return;
    }

    if (requestUrl.pathname === '/api/videos' && route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          videos: [],
          nextCursor: null,
          total: 0,
          facets: { characterNames: [], formats: [] },
        }),
      });
      return;
    }

    if (requestUrl.pathname === '/api/videos' && route.request().method() === 'POST') {
      savedVideoSequence += 1;
      const metadataHeader = route.request().headers()['x-lightframe-video-metadata'];
      const metadata = metadataHeader
        ? (JSON.parse(decodeURIComponent(metadataHeader)) as {
            title: string;
            filename: string;
            origin: SavedVideoDetail['currentVersion']['origin'];
            characterName: string | null;
            characterVariantName: string | null;
            sourceVideoId: string | null;
            sourceVersionId: string | null;
          })
        : null;
      const videoId = `10000000-0000-4000-8000-${savedVideoSequence.toString().padStart(12, '0')}`;
      const versionId = `20000000-0000-4000-8000-${savedVideoSequence.toString().padStart(12, '0')}`;
      const createdAt = '2030-01-01T00:00:00.000Z';
      const version = {
        id: versionId,
        videoId,
        ordinal: 1,
        origin: metadata?.origin ?? 'recorded',
        characterName: metadata?.characterName ?? null,
        characterVariantName: metadata?.characterVariantName ?? null,
        sourceVersionId: metadata?.sourceVersionId ?? null,
        mimeType: (route.request().headers()['content-type'] ??
          'video/mp4') as SavedVideoDetail['currentVersion']['mimeType'],
        filename: metadata?.filename ?? 'saved-video.mp4',
        sizeBytes: Math.max(1, route.request().postDataBuffer()?.byteLength ?? 1),
        durationMs: 1_000,
        width: 1_280,
        height: 720,
        createdAt,
      };
      const savedVideo = {
        id: videoId,
        title: metadata?.title ?? 'Saved video',
        status: 'ready' as const,
        currentVersion: version,
        sourceVideoId: metadata?.sourceVideoId ?? null,
        versionCount: 1,
        thumbnailAvailable: false,
        createdAt,
        updatedAt: createdAt,
        versions: [version],
      } satisfies SavedVideoDetail;
      savedVideos.set(videoId, savedVideo);
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(savedVideo),
      });
      return;
    }

    const savedVideoThumbnailMatch = requestUrl.pathname.match(
      /^\/api\/videos\/([^/]+)\/versions\/([^/]+)\/thumbnail$/u,
    );
    if (savedVideoThumbnailMatch && route.request().method() === 'PUT') {
      const video = savedVideos.get(savedVideoThumbnailMatch[1] ?? '');
      if (!video || video.currentVersion.id !== savedVideoThumbnailMatch[2]) {
        await route.fulfill({ status: 404, body: '' });
        return;
      }
      const updated = { ...video, thumbnailAvailable: true } satisfies SavedVideoDetail;
      savedVideos.set(video.id, updated);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(updated),
      });
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
          realtimeVideo: {
            available: options.realtimeVideoAvailable ?? true,
          },
          videoProcessing: {
            characterSwap: {
              available: options.videoProcessingAvailable ?? true,
              inputPreparation: 'none',
              referencePolicy: 'optional',
              promptInput: 'editable',
              promptEnhancement: true,
              terminalFailureRelease: 'automatic',
              outputResolutions: ['720p'],
            },
            virtualTryOn: {
              available: options.videoProcessingAvailable ?? true,
              inputPreparation: 'none',
              referencePolicy: 'optional',
              promptInput: 'editable',
              promptEnhancement: true,
              terminalFailureRelease: 'automatic',
              outputResolutions: ['720p'],
            },
          },
          elevenLabs: {
            available: options.elevenLabsAvailable ?? false,
            modelId: options.elevenLabsAvailable ? 'eleven_multilingual_sts_v2' : null,
          },
          referenceImages: {
            available: options.referenceImagesAvailable ?? true,
            editAvailable: options.referenceImagesAvailable ?? true,
            providerId: 'openai',
            modelId: 'gpt-image-2',
            sizes: ['1024x1024', '1024x1536', '1536x1024'],
            optimizer: {
              available: options.referenceImagesAvailable ?? true,
              model: 'gpt-5.6',
              version: 'lucy-character-reference-v1',
            },
          },
          wardrobe: {
            addOutfitAvailable: options.wardrobeAddOutfitAvailable ?? false,
          },
        }),
      });
      return;
    }

    if (requestUrl.pathname === '/api/creative-library' && route.request().method() === 'GET') {
      network.apiRequests.push({ path: requestUrl.pathname, model: null });
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'not_found', message: 'No API route matches this request.' },
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

    if (
      requestUrl.pathname === '/api/reference-images/uploads' &&
      route.request().method() === 'POST'
    ) {
      const requestId = route.request().headers()['idempotency-key'] ?? '';
      const bytes = route.request().postDataBuffer() ?? Buffer.alloc(0);
      const uploadedByteSize = Math.max(bytes.byteLength, REFERENCE_PNG.byteLength);
      let asset = uploadedAssetsByRequestId.get(requestId);
      if (!asset) {
        assetSequence += 1;
        const assetId = assetIdForSequence(assetSequence);
        asset = {
          assetId,
          mimeType: 'image/png',
          byteSize: uploadedByteSize,
          source: 'uploaded',
          width: 1536,
          height: 1024,
          createdAt: '2030-01-01T00:00:00.000Z',
          updatedAt: '2030-01-01T00:00:00.000Z',
          contentUrl: `/api/reference-images/${assetId}/content`,
        };
        uploadedAssetsByRequestId.set(requestId, asset);
        assets.set(asset.assetId, asset);
      }
      network.apiRequests.push({ path: requestUrl.pathname, model: null });
      network.referenceWorkflowCalls.push('upload');
      network.referenceImageUploads.push({
        requestId,
        assetId: asset.assetId,
        byteSize: uploadedByteSize,
        mimeType: route.request().headers()['content-type'] ?? '',
      });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ asset }),
      });
      return;
    }

    if (requestUrl.pathname === '/api/reference-images' && route.request().method() === 'POST') {
      const payload = route.request().postDataJSON() as CreateReferenceImageRequest;
      let asset = generatedAssetsByRequestId.get(payload.requestId);
      if (!asset) {
        assetSequence += 1;
        asset = createMockReferenceAsset(assetSequence, payload);
        generatedAssetsByRequestId.set(payload.requestId, asset);
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

    const compositionMatch = requestUrl.pathname.match(
      /^\/api\/reference-images\/([0-9a-f-]+)\/compositions$/u,
    );
    if (compositionMatch && route.request().method() === 'POST') {
      const sourceAssetId = compositionMatch[1] ?? '';
      const payload = route.request().postDataJSON() as ComposeReferenceImageRequest;
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
      let asset = generatedAssetsByRequestId.get(payload.requestId);
      if (!asset) {
        assetSequence += 1;
        asset = {
          ...createMockReferenceAsset(assetSequence, payload),
          derivation: { kind: 'compose', sourceAssetId },
        };
        generatedAssetsByRequestId.set(payload.requestId, asset);
        assets.set(asset.assetId, asset);
      }
      network.apiRequests.push({ path: requestUrl.pathname, model: null });
      network.referenceWorkflowCalls.push('compose');
      network.referenceImageCompositions.push({
        ...payload,
        sourceAssetId,
        assetId: asset.assetId,
        imagePromptSentToProvider: asset.optimizedImagePrompt,
      });
      await route.fulfill({
        status: 200,
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
      let asset = generatedAssetsByRequestId.get(payload.requestId);
      if (!asset) {
        assetSequence += 1;
        asset = {
          ...createMockReferenceAsset(assetSequence, payload),
          derivation: { kind: 'edit', sourceAssetId },
        };
        generatedAssetsByRequestId.set(payload.requestId, asset);
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

    const outfitTryOnMatch = requestUrl.pathname.match(
      /^\/api\/reference-images\/([0-9a-f-]+)\/outfit-try-ons$/u,
    );
    if (outfitTryOnMatch && route.request().method() === 'POST') {
      const sourceAssetId = outfitTryOnMatch[1] ?? '';
      const payload = route.request().postDataJSON() as OutfitTryOnRequest;
      if (!assets.has(sourceAssetId) || !assets.has(payload.garmentAssetId)) {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({
            error: { code: 'not_found', message: 'That local reference image is unavailable.' },
          }),
        });
        return;
      }
      let asset = outfitAssetsByRequestId.get(payload.requestId);
      if (!asset) {
        assetSequence += 1;
        const assetId = assetIdForSequence(assetSequence);
        asset = {
          assetId,
          mimeType: 'image/png',
          byteSize: REFERENCE_PNG.byteLength,
          source: 'derived',
          provider: 'pruna',
          model: 'p-image-try-on',
          width: 1024,
          height: 1024,
          derivation: {
            kind: 'outfit-try-on',
            sourceAssetId,
            garmentAssetId: payload.garmentAssetId,
          },
          createdAt: '2030-01-01T00:00:00.000Z',
          updatedAt: '2030-01-01T00:00:00.000Z',
          contentUrl: `/api/reference-images/${assetId}/content`,
        };
        outfitAssetsByRequestId.set(payload.requestId, asset);
        assets.set(asset.assetId, asset);
      }
      network.apiRequests.push({ path: requestUrl.pathname, model: null });
      network.referenceWorkflowCalls.push('outfit-try-on');
      network.outfitTryOns.push({ ...payload, sourceAssetId, assetId: asset.assetId });
      await route.fulfill({
        status: 200,
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
      network.voiceRequests.push({
        kind: 'list',
        voiceId: null,
        providerIntent: route.request().headers()['x-lightframe-provider-intent'] ?? null,
        contentType: null,
        bodyByteSize: 0,
      });
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
              traits: {
                language: 'en',
                gender: 'neutral',
                age: 'middle-aged',
                accent: 'Canadian',
                useCase: 'narration',
                descriptive: 'grounded',
              },
              previewAvailable: true,
              removable: true,
            },
            ...(sharedVoiceSaved
              ? [
                  {
                    voiceId: 'atlas-community',
                    name: 'Atlas Community',
                    category: 'professional',
                    description: 'Warm community narration',
                    labels: { language: 'en' },
                    traits: {
                      language: 'en',
                      gender: 'male',
                      age: 'middle-aged',
                      accent: 'American',
                      useCase: 'narration',
                      descriptive: 'warm',
                    },
                    previewAvailable: true,
                    removable: true,
                  },
                ]
              : []),
          ],
          hasMore: false,
          nextPageToken: null,
          total: sharedVoiceSaved ? 2 : 1,
        }),
      });
      return;
    }

    if (
      requestUrl.pathname === '/api/elevenlabs/shared-voices' &&
      route.request().method() === 'GET'
    ) {
      network.apiRequests.push({ path: requestUrl.pathname, model: null });
      network.voiceRequests.push({
        kind: 'browse',
        voiceId: null,
        providerIntent: route.request().headers()['x-lightframe-provider-intent'] ?? null,
        contentType: null,
        bodyByteSize: 0,
      });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          voices: [
            {
              publicOwnerId: 'owner-atlas',
              voiceId: 'atlas-community',
              name: 'Atlas Community',
              category: 'professional',
              description: 'Warm community narration',
              labels: { language: 'en' },
              traits: {
                language: 'en',
                gender: 'male',
                age: 'middle-aged',
                accent: 'American',
                useCase: 'narration',
                descriptive: 'warm',
              },
              previewAvailable: true,
              saved: sharedVoiceSaved,
            },
          ],
          hasMore: false,
          page: Number(requestUrl.searchParams.get('page') ?? 0),
          total: 1,
        }),
      });
      return;
    }

    const sharedSaveMatch = requestUrl.pathname.match(
      /^\/api\/elevenlabs\/shared-voices\/([^/]+)\/([^/]+)\/save$/u,
    );
    if (sharedSaveMatch && route.request().method() === 'POST') {
      sharedVoiceSaved = true;
      network.apiRequests.push({ path: requestUrl.pathname, model: null });
      network.voiceRequests.push({
        kind: 'save',
        voiceId: decodeURIComponent(sharedSaveMatch[2] ?? ''),
        providerIntent: route.request().headers()['x-lightframe-provider-intent'] ?? null,
        contentType: null,
        bodyByteSize: 0,
      });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'saved', voiceId: 'atlas-community' }),
      });
      return;
    }

    const voiceDeleteMatch = requestUrl.pathname.match(/^\/api\/elevenlabs\/voices\/([^/]+)$/u);
    if (voiceDeleteMatch && route.request().method() === 'DELETE') {
      sharedVoiceSaved = false;
      network.apiRequests.push({ path: requestUrl.pathname, model: null });
      network.voiceRequests.push({
        kind: 'delete',
        voiceId: decodeURIComponent(voiceDeleteMatch[1] ?? ''),
        providerIntent: route.request().headers()['x-lightframe-provider-intent'] ?? null,
        contentType: null,
        bodyByteSize: 0,
      });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'removed', voiceId: 'atlas-community' }),
      });
      return;
    }

    const voicePreviewMatch = requestUrl.pathname.match(
      /^\/api\/elevenlabs\/voices\/([^/]+)\/preview$/u,
    );
    if (voicePreviewMatch && route.request().method() === 'GET') {
      network.apiRequests.push({ path: requestUrl.pathname, model: null });
      network.voiceRequests.push({
        kind: 'preview',
        voiceId: decodeURIComponent(voicePreviewMatch[1] ?? ''),
        providerIntent: route.request().headers()['x-lightframe-provider-intent'] ?? null,
        contentType: null,
        bodyByteSize: 0,
      });
      await route.fulfill({
        status: 200,
        contentType: 'audio/wav',
        body: REPLACEMENT_VOICE_WAV,
      });
      return;
    }

    if (
      requestUrl.pathname === '/api/elevenlabs/voice-changer/recording' &&
      route.request().method() === 'POST'
    ) {
      network.apiRequests.push({ path: requestUrl.pathname, model: null });
      const body = route.request().postDataBuffer() ?? Buffer.alloc(0);
      network.voiceRequests.push({
        kind: 'convert',
        voiceId: requestUrl.searchParams.get('voiceId'),
        providerIntent: route.request().headers()['x-lightframe-provider-intent'] ?? null,
        contentType: route.request().headers()['content-type'] ?? null,
        bodyByteSize: body.byteLength,
      });
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
