// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { VOICE_PROVIDER_INTENT_HEADER, VOICE_PROVIDER_INTENT_VALUE } from '@studio/contracts';
import type { PublicVoiceItem, WorkspaceVoiceItem } from '../../application/types';
import {
  convertRecordingVoice,
  fetchVoicePreview,
  importPublicVoice,
  listPublicVoices,
  listWorkspaceVoices,
} from './voicesApi';

const workspaceVoice: WorkspaceVoiceItem = {
  kind: 'workspace',
  voice: {
    voiceId: 'workspace-voice',
    name: 'Workspace Star',
    category: null,
    description: null,
    labels: {},
    previewAvailable: true,
  },
};

const publicVoice: PublicVoiceItem = {
  kind: 'public',
  voice: {
    ...workspaceVoice.voice,
    voiceId: 'public-voice',
    publicOwnerId: 'public-owner',
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('voice API provider intent', () => {
  it('marks workspace and public list reads and preserves their discriminants', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            voices: [workspaceVoice.voice],
            hasMore: false,
            nextPageToken: null,
            total: 1,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            voices: [publicVoice.voice],
            page: 0,
            hasMore: false,
            nextPageToken: null,
            total: 1,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);
    const signal = new AbortController().signal;

    await expect(listWorkspaceVoices('', null, signal)).resolves.toMatchObject({
      voices: [workspaceVoice],
    });
    await expect(listPublicVoices('', 0, signal)).resolves.toMatchObject({
      voices: [publicVoice],
    });

    for (const [, init] of fetchMock.mock.calls) {
      expect(new Headers(init?.headers).get(VOICE_PROVIDER_INTENT_HEADER)).toBe(
        VOICE_PROVIDER_INTENT_VALUE,
      );
    }
  });

  it('marks preview, import, and conversion requests', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(new Blob(['preview'], { type: 'audio/mpeg' }), {
          status: 200,
          headers: { 'Content-Type': 'audio/mpeg' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ voiceId: 'imported-voice' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(new Blob(['converted'], { type: 'audio/mpeg' }), {
          status: 200,
          headers: { 'Content-Type': 'audio/mpeg' },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const signal = new AbortController().signal;

    await expect(fetchVoicePreview(publicVoice, signal)).resolves.toMatchObject({
      type: 'audio/mpeg',
    });
    await expect(importPublicVoice(publicVoice, signal)).resolves.toBe('imported-voice');
    await expect(
      convertRecordingVoice(
        'workspace-voice',
        new Blob(['sidecar'], { type: 'audio/webm' }),
        signal,
      ),
    ).resolves.toMatchObject({ type: 'audio/mpeg' });

    for (const [, init] of fetchMock.mock.calls) {
      expect(new Headers(init?.headers).get(VOICE_PROVIDER_INTENT_HEADER)).toBe(
        VOICE_PROVIDER_INTENT_VALUE,
      );
    }
  });
});
