// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import {
  VOICE_CONVERSION_OUTPUT_MAX_BYTES,
  VOICE_PREVIEW_MAX_BYTES,
  VOICE_PROVIDER_INTENT_HEADER,
  VOICE_PROVIDER_INTENT_VALUE,
} from '@studio/contracts';
import type { SharedVoiceItem, WorkspaceVoiceItem } from '../../application/types';
import {
  convertRecordingVoice,
  fetchVoicePreview,
  listSharedVoices,
  listWorkspaceVoices,
  removeWorkspaceVoice,
  saveSharedVoice,
} from './voicesApi';
import {
  captureRequests,
  jsonScenario,
  malformedContractScenario,
  responseScenario,
} from '../../test/msw/handlers';
import { mockApiServer } from '../../test/msw/server';

const workspaceVoice: WorkspaceVoiceItem = {
  kind: 'workspace',
  voice: {
    voiceId: 'workspace-voice',
    name: 'Workspace Star',
    category: null,
    description: null,
    labels: {},
    traits: {
      language: null,
      gender: null,
      age: null,
      accent: null,
      useCase: null,
      descriptive: null,
    },
    previewAvailable: true,
    removable: false,
  },
};

const emptyCriteria = {
  search: '',
  language: '',
  gender: '',
  age: '',
  accent: '',
  useCase: '',
  descriptive: '',
} as const;

const sharedVoice: SharedVoiceItem = {
  kind: 'shared',
  voice: {
    voiceId: 'shared-voice',
    publicOwnerId: 'owner-one',
    name: 'Catalog Star',
    category: 'professional',
    description: 'Warm narration',
    labels: { language: 'en' },
    traits: {
      language: 'en',
      gender: 'female',
      age: 'middle-aged',
      accent: 'American',
      useCase: 'narration',
      descriptive: 'warm',
    },
    previewAvailable: true,
    saved: false,
  },
};

describe('voice API provider intent', () => {
  it('uses the voice-specific invalid response for malformed success JSON', async () => {
    mockApiServer.use(malformedContractScenario('GET', '/api/elevenlabs/voices'));

    await expect(
      listWorkspaceVoices(emptyCriteria, null, new AbortController().signal),
    ).rejects.toThrow('The saved voice library response was invalid.');
  });

  it('marks saved-library reads and preserves the workspace discriminant', async () => {
    const { requests, observe } = captureRequests();
    mockApiServer.use(
      jsonScenario(
        'GET',
        '/api/elevenlabs/voices',
        {
          body: {
            voices: [workspaceVoice.voice],
            hasMore: false,
            nextPageToken: null,
            total: 1,
          },
        },
        observe,
      ),
    );
    const signal = new AbortController().signal;

    await expect(listWorkspaceVoices(emptyCriteria, null, signal)).resolves.toMatchObject({
      voices: [workspaceVoice],
    });

    for (const request of requests) {
      expect(request.headers.get(VOICE_PROVIDER_INTENT_HEADER)).toBe(VOICE_PROVIDER_INTENT_VALUE);
    }
  });

  it('maps Browse filters, discriminants, pagination, and mutation routes', async () => {
    const { requests, observe } = captureRequests();
    mockApiServer.use(
      jsonScenario(
        'GET',
        '/api/elevenlabs/shared-voices',
        { body: { voices: [sharedVoice.voice], hasMore: true, page: 2, total: 21 } },
        observe,
      ),
      jsonScenario(
        'POST',
        '/api/elevenlabs/shared-voices/owner-one/shared-voice/save',
        { body: { status: 'saved', voiceId: 'shared-voice' } },
        observe,
      ),
      jsonScenario(
        'DELETE',
        '/api/elevenlabs/voices/shared-voice',
        { body: { status: 'removed', voiceId: 'shared-voice' } },
        observe,
      ),
    );
    const criteria = { ...emptyCriteria, search: 'catalog', language: 'en' };

    await expect(
      listSharedVoices(criteria, 2, 'trending', new AbortController().signal, true),
    ).resolves.toMatchObject({ voices: [sharedVoice], page: 2 });
    await expect(saveSharedVoice(sharedVoice, new AbortController().signal)).resolves.toMatchObject(
      {
        status: 'saved',
      },
    );
    await expect(
      removeWorkspaceVoice('shared-voice', new AbortController().signal),
    ).resolves.toMatchObject({ status: 'removed' });

    const browseUrl = new URL(requests[0]!.url);
    expect(Object.fromEntries(browseUrl.searchParams)).toMatchObject({
      search: 'catalog',
      language: 'en',
      pageSize: '20',
      page: '2',
      sort: 'trending',
      refresh: 'true',
    });
    expect(requests[1]!.method).toBe('POST');
    expect(requests[2]!.method).toBe('DELETE');
    for (const request of requests) {
      expect(request.headers.get(VOICE_PROVIDER_INTENT_HEADER)).toBe(VOICE_PROVIDER_INTENT_VALUE);
    }
  });

  it('marks preview and conversion requests', async () => {
    const { requests, observe } = captureRequests();
    mockApiServer.use(
      responseScenario(
        'GET',
        '/api/elevenlabs/voices/workspace-voice/preview',
        'preview',
        {
          status: 200,
          headers: { 'Content-Type': 'audio/mpeg' },
        },
        observe,
      ),
      responseScenario(
        'POST',
        '/api/elevenlabs/voice-changer/recording',
        'converted',
        {
          status: 200,
          headers: { 'Content-Type': 'audio/mpeg' },
        },
        observe,
      ),
    );
    const signal = new AbortController().signal;

    await expect(fetchVoicePreview(workspaceVoice, signal)).resolves.toMatchObject({
      type: 'audio/mpeg',
    });
    await expect(
      convertRecordingVoice(
        'workspace-voice',
        new Blob(['sidecar'], { type: 'audio/webm' }),
        signal,
      ),
    ).resolves.toMatchObject({ type: 'audio/mpeg' });

    for (const request of requests) {
      expect(request.headers.get(VOICE_PROVIDER_INTENT_HEADER)).toBe(VOICE_PROVIDER_INTENT_VALUE);
    }
  });

  it('rejects declared oversized conversion audio before buffering it', async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ cancel });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(body, {
        status: 200,
        headers: {
          'Content-Type': 'audio/mpeg',
          'Content-Length': String(VOICE_CONVERSION_OUTPUT_MAX_BYTES + 1),
        },
      }),
    );

    await expect(
      convertRecordingVoice(
        'workspace-voice',
        new Blob(['sidecar'], { type: 'audio/webm' }),
        new AbortController().signal,
      ),
    ).rejects.toThrow('The voice conversion response was invalid.');
    await vi.waitFor(() => expect(cancel).toHaveBeenCalledOnce());
  });

  it('counts chunked preview bytes and returns only a safe normalized overflow error', async () => {
    const cancel = vi.fn();
    let pulls = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        controller.enqueue(new Uint8Array(VOICE_PREVIEW_MAX_BYTES / 2 + 1));
      },
      cancel,
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(body, {
        status: 200,
        headers: { 'Content-Type': 'audio/mpeg' },
      }),
    );

    const error = await fetchVoicePreview(workspaceVoice, new AbortController().signal).catch(
      (reason: unknown) => reason,
    );

    expect(error).toEqual(
      new Error('The voice preview response was invalid. Refresh and try again.'),
    );
    expect(String(error)).not.toContain('provider');
    expect(pulls).toBeLessThanOrEqual(3);
    await vi.waitFor(() => expect(cancel).toHaveBeenCalledOnce());
  });

  it('cancels an in-flight browser audio reader and preserves AbortError semantics', async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ cancel });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(body, {
        status: 200,
        headers: { 'Content-Type': 'audio/mpeg' },
      }),
    );
    const controller = new AbortController();
    const pending = fetchVoicePreview(workspaceVoice, controller.signal);

    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(cancel).toHaveBeenCalledOnce());
  });
});
