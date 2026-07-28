// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { VOICE_PROVIDER_INTENT_HEADER, VOICE_PROVIDER_INTENT_VALUE } from '@studio/contracts';
import type { WorkspaceVoiceItem } from '../../application/types';
import { convertRecordingVoice, fetchVoicePreview, listWorkspaceVoices } from './voicesApi';

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

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('voice API provider intent', () => {
  it('uses the voice-specific invalid response for malformed success JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('{not-json', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    await expect(listWorkspaceVoices('', null, new AbortController().signal)).rejects.toThrow(
      'The saved voice library response was invalid.',
    );
  });

  it('marks saved-library reads and preserves the workspace discriminant', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          voices: [workspaceVoice.voice],
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

    for (const [, init] of fetchMock.mock.calls) {
      expect(new Headers(init?.headers).get(VOICE_PROVIDER_INTENT_HEADER)).toBe(
        VOICE_PROVIDER_INTENT_VALUE,
      );
    }
  });

  it('marks preview and conversion requests', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response('preview', {
          status: 200,
          headers: { 'Content-Type': 'audio/mpeg' },
        }),
      )
      .mockResolvedValueOnce(
        new Response('converted', {
          status: 200,
          headers: { 'Content-Type': 'audio/mpeg' },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
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

    for (const [, init] of fetchMock.mock.calls) {
      expect(new Headers(init?.headers).get(VOICE_PROVIDER_INTENT_HEADER)).toBe(
        VOICE_PROVIDER_INTENT_VALUE,
      );
    }
  });
});
