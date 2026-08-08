import { describe, expect, it, vi } from 'vitest';
import { FakeElevenLabsProvider, sharedVoice, voice } from '../../test/fakes.js';
import { VoiceService } from './voice-service.js';

const signal = (): AbortSignal => new AbortController().signal;
const filters = {
  search: '',
  language: '',
  gender: '',
  age: '',
  accent: '',
  useCase: '',
  descriptive: '',
} as const;

const serviceFor = (provider: FakeElevenLabsProvider): VoiceService =>
  new VoiceService(provider, 'eleven_multilingual_sts_v2', false);

describe('VoiceService catalog and saved-library policy', () => {
  it('fails closed on nonstandard rates and free-user restrictions, then annotates saved IDs', async () => {
    const provider = new FakeElevenLabsProvider();
    provider.sharedVoices = [
      sharedVoice({ voiceId: 'eligible' }),
      sharedVoice({ voiceId: 'custom-rate', rate: 1.5 }),
      sharedVoice({ voiceId: 'not-free', freeUsersAllowed: false }),
    ];
    provider.sharedTotal = 3;
    provider.workspaceVoices = [voice({ voiceId: 'eligible' })];

    const service = serviceFor(provider);
    await service.listWorkspaceVoices({
      ...filters,
      pageSize: 20,
      nextPageToken: null,
      refresh: false,
      signal: signal(),
    });
    const page = await service.listSharedVoices({
      ...filters,
      pageSize: 20,
      page: 0,
      sort: 'trending',
      refresh: false,
      signal: signal(),
    });

    expect(page.voices).toHaveLength(1);
    expect(page.voices[0]).toMatchObject({ voiceId: 'eligible', saved: true });
    expect(page.total).toBeNull();
  });

  it('shares cached catalog reads and bypasses them on explicit refresh', async () => {
    const provider = new FakeElevenLabsProvider();
    const service = serviceFor(provider);
    const input = {
      ...filters,
      pageSize: 20,
      page: 0,
      sort: 'trending' as const,
      refresh: false,
      signal: signal(),
    };

    await service.listSharedVoices(input);
    await service.listSharedVoices({ ...input, signal: signal() });
    expect(provider.sharedSearches).toHaveLength(1);

    await service.listSharedVoices({ ...input, refresh: true, signal: signal() });
    expect(provider.sharedSearches).toHaveLength(2);
  });

  it('coalesces the first saved-workspace migration across concurrent callers', async () => {
    const provider = new FakeElevenLabsProvider();
    const service = serviceFor(provider);
    const input = {
      ...filters,
      pageSize: 20,
      nextPageToken: null,
      refresh: false,
    };

    await Promise.all([
      service.listWorkspaceVoices({ ...input, signal: signal() }),
      service.listWorkspaceVoices({ ...input, signal: signal() }),
    ]);

    expect(provider.workspaceSearches).toHaveLength(2);
  });

  it('coalesces concurrent adds and revalidates exact standard-rate metadata', async () => {
    const provider = new FakeElevenLabsProvider();
    provider.workspaceVoices = [];
    const getSharedVoice = vi.spyOn(provider, 'getSharedVoice');
    const addSharedVoice = vi.spyOn(provider, 'addSharedVoice');
    const service = serviceFor(provider);

    const results = await Promise.all([
      service.saveSharedVoice('owner-one', 'shared-one', signal()),
      service.saveSharedVoice('owner-one', 'shared-one', signal()),
    ]);

    expect(results).toEqual([
      { status: 'saved', voiceId: 'shared-one' },
      { status: 'saved', voiceId: 'shared-one' },
    ]);
    expect(getSharedVoice).toHaveBeenCalledOnce();
    expect(addSharedVoice).toHaveBeenCalledOnce();

    provider.sharedVoices = [sharedVoice({ voiceId: 'ineligible', rate: 2 })];
    await expect(
      service.saveSharedVoice('owner-one', 'ineligible', signal()),
    ).rejects.toMatchObject({ reason: 'shared-voice-ineligible' });
  });

  it('removes only the app-owned relationship and leaves the provider workspace unchanged', async () => {
    const provider = new FakeElevenLabsProvider();
    const service = serviceFor(provider);

    provider.workspaceVoices = [voice({ isOwner: true })];
    await service.listWorkspaceVoices({
      ...filters,
      pageSize: 20,
      nextPageToken: null,
      refresh: false,
      signal: signal(),
    });
    await expect(service.removeWorkspaceVoice('voice-one', signal())).resolves.toEqual({
      status: 'removed',
      voiceId: 'voice-one',
    });
    await expect(service.removeWorkspaceVoice('voice-one', signal())).resolves.toEqual({
      status: 'already-removed',
      voiceId: 'voice-one',
    });
    expect(provider.deletedVoiceIds).toHaveLength(0);
  });

  it('applies exact normalized saved traits while retaining opaque continuation state', async () => {
    const provider = new FakeElevenLabsProvider();
    provider.workspaceVoices = [
      voice({ voiceId: 'match', language: 'en', gender: 'female' }),
      voice({ voiceId: 'miss', language: 'fr', gender: 'female' }),
    ];
    const page = await serviceFor(provider).listWorkspaceVoices({
      ...filters,
      language: 'EN',
      gender: 'Female',
      pageSize: 20,
      nextPageToken: null,
      refresh: false,
      signal: signal(),
    });

    expect(page.voices.map((candidate) => candidate.voiceId)).toEqual(['match']);
    expect(page.voices[0]?.removable).toBe(true);
  });

  it('does not reuse a workspace page cached for different voice filters', async () => {
    const provider = new FakeElevenLabsProvider();
    provider.workspaceVoices = [
      voice({ voiceId: 'english', language: 'en' }),
      voice({ voiceId: 'french', language: 'fr' }),
    ];
    const service = serviceFor(provider);

    await service.listWorkspaceVoices({
      ...filters,
      language: 'en',
      pageSize: 20,
      nextPageToken: null,
      refresh: false,
      signal: signal(),
    });
    const french = await service.listWorkspaceVoices({
      ...filters,
      language: 'fr',
      pageSize: 20,
      nextPageToken: null,
      refresh: false,
      signal: signal(),
    });

    expect(provider.workspaceSearches.slice(-2).map((search) => search.language)).toEqual([
      'en',
      'fr',
    ]);
    expect(french.voices.map((candidate) => candidate.voiceId)).toEqual(['french']);
  });
});
