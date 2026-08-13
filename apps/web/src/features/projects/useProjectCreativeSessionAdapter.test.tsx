// @vitest-environment jsdom

import type { ProjectCurrentResponse } from '@studio/contracts';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWorkspaceVoiceRelationship } from '../../adapters/api-client/voicesApi';
import type { CreativeAssetStore } from '../creative-assets/types';
import { useProjectCreativeSessionAdapter } from './useProjectCreativeSessionAdapter';

vi.mock('../../adapters/api-client/voicesApi', () => ({
  fetchWorkspaceVoiceRelationship: vi.fn(),
}));

const projectId = '18b120ac-1578-46e3-8c3d-42307772f391';
const revisionId = '89a972fe-bfb5-4214-94f7-4bd54f12ce06';
const sourceAssetId = '79b94c02-d268-4201-a05b-1f3baa0caed1';
const now = '2026-08-13T16:00:00.000Z';

const store: CreativeAssetStore = {
  schemaVersion: 7,
  recentPrompts: [],
  savedPrompts: [],
  savedCharacterPrompts: [],
  savedCharacterVariants: [],
};

const current = (): ProjectCurrentResponse => ({
  project: {
    id: projectId,
    campaignId: null,
    title: 'Voice checkpoint',
    status: 'ready',
    version: 2,
    currentRevisionId: revisionId,
    currentRevisionNumber: 2,
    archivedAt: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  },
  revision: {
    id: revisionId,
    projectId,
    revisionNumber: 2,
    parentRevisionId: null,
    parentRevisionNumber: 1,
    snapshot: {
      schemaVersion: 2,
      sourceAssetId,
      workingMedia: { kind: 'asset', assetId: sourceAssetId },
      presentedMedia: { kind: 'asset', assetId: sourceAssetId },
      selectedCharacter: null,
      selectedOutfit: null,
      selectedVoice: {
        kind: 'saved-voice',
        voiceId: 'voice-one',
        voiceName: 'Historical Nova',
        resourceRevision: null,
        treatment: {
          stability: null,
          similarity: null,
          style: null,
          speakerBoost: null,
        },
      },
      visualTreatment: { kind: 'none' },
      liveMode: {
        modeId: 'local',
        captureFormat: 'portrait',
        audioSource: 'local-microphone',
      },
      creativeIntent: {
        promptId: null,
        promptLabel: null,
        recipeId: null,
        recipeLabel: null,
        userIntent: '',
        appliedPrompt: null,
        referenceAssetId: null,
        resourceRevision: null,
      },
      localEdit: null,
      exportSpecification: null,
      lastSuccessfulOutput: null,
      workflowPhase: 'creative',
      createdAt: now,
      updatedAt: now,
    },
    authorKind: 'user',
    source: 'user-edit',
    createdAt: now,
  },
});

const setup = () => {
  const snapshot = current();
  const restoreAspectRatio = vi.fn(() => true);
  const selectVoice = vi.fn();
  const dependencies = {
    projectId,
    projectSession: {
      current: snapshot,
      getCurrent: vi.fn(() => snapshot),
      propose: vi.fn(() => true),
      flush: vi.fn(() => Promise.resolve(true)),
    },
    studioSession: {
      draft: { mode: 'local', prompt: '', referenceImage: null, enhance: false },
      capturePreferences: {
        applied: {
          videoDeviceId: null,
          audioDeviceId: null,
          profile: '720p30',
          aspectRatio: '16:9',
        },
        restoreAspectRatio,
      },
      replaceRecipeDraft: vi.fn(() => true),
      selectMode: vi.fn(() => true),
    },
    handoff: { state: { activeRecipe: null }, actions: { useRecipe: vi.fn() } },
    repository: {
      ready: vi.fn(() => Promise.resolve()),
      getSnapshot: vi.fn(() => ({ store, health: 'ready', notice: null })),
    },
    store,
    existingVideo: {
      selection: null,
      phase: 'idle',
      original: null,
      steps: [],
      voiceSelection: null,
      adoptRecordedArtifact: vi.fn(),
      selectLocalVoice: vi.fn(),
      selectVoice,
      clearVoice: vi.fn(),
      removeStep: vi.fn(),
      addStep: vi.fn(),
      updateStep: vi.fn(),
    },
  } as unknown as Parameters<typeof useProjectCreativeSessionAdapter>[0];
  return { dependencies, restoreAspectRatio, selectVoice };
};

describe('useProjectCreativeSessionAdapter saved Voice hydration', () => {
  beforeEach(() => vi.clearAllMocks());

  it('restores the exact saved Voice only after the owner relationship succeeds', async () => {
    vi.mocked(fetchWorkspaceVoiceRelationship).mockResolvedValue({
      voiceId: 'voice-one',
      saved: true,
    });
    const { dependencies, restoreAspectRatio, selectVoice } = setup();

    renderHook(() => useProjectCreativeSessionAdapter(dependencies));

    await waitFor(() => expect(selectVoice).toHaveBeenCalledWith('voice-one', 'Historical Nova'));
    expect(restoreAspectRatio).toHaveBeenCalledWith('9:16');
  });

  it('retains a historical explanation without restoring a missing or wrong-owner Voice', async () => {
    vi.mocked(fetchWorkspaceVoiceRelationship).mockResolvedValue({
      voiceId: 'voice-one',
      saved: false,
    });
    const { dependencies, selectVoice } = setup();

    const { result } = renderHook(() => useProjectCreativeSessionAdapter(dependencies));

    await waitFor(() =>
      expect(result.current.resourceIssues).toContainEqual(
        expect.objectContaining({ kind: 'voice', reason: 'missing' }),
      ),
    );
    expect(selectVoice).not.toHaveBeenCalled();
  });
});
