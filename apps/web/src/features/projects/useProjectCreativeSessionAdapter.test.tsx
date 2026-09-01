// @vitest-environment jsdom

import type { ProjectCurrentResponse, ProjectSessionProposalContract } from '@studio/contracts';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
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

const setup = (
  overrides: {
    readonly snapshot?: Partial<ProjectCurrentResponse['revision']['snapshot']>;
    readonly existingVideo?: Record<string, unknown>;
  } = {},
) => {
  const base = current();
  const snapshot: ProjectCurrentResponse = {
    ...base,
    revision: {
      ...base.revision,
      snapshot: { ...base.revision.snapshot, ...overrides.snapshot },
    },
  };
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
    handoff: {
      state: { activeRecipe: null },
      actions: { useRecipe: vi.fn(), clearActiveRecipe: vi.fn(() => true) },
    },
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
      ...overrides.existingVideo,
    },
  } as unknown as Parameters<typeof useProjectCreativeSessionAdapter>[0];
  return { dependencies, restoreAspectRatio, selectVoice };
};

const completedOutputSnapshot = {
  selectedVoice: null,
  visualTreatment: { kind: 'none' },
  lastSuccessfulOutput: {
    savedVideoId: 'ea77cbd9-c453-4f58-a9a0-42bf8aaef338',
    videoVersionId: 'b276694b-58c4-40d3-8fb6-315e32b66fd0',
  },
  workflowPhase: 'complete',
} as const;

const leftoverStep = {
  id: 'a2e6a2f8-3f1a-4c2e-8a53-6f5d0b6d9a11',
  modelId: 'lucy-latest',
  savedRecipeId: 'character-one',
  prompt: 'Nova presenting the product',
};

describe('useProjectCreativeSessionAdapter output completion', () => {
  beforeEach(() => vi.clearAllMocks());

  it('frees the visual tool once for a saved output revision', async () => {
    const { dependencies } = setup({
      snapshot: completedOutputSnapshot,
      existingVideo: { steps: [leftoverStep], voiceSelection: { voiceId: 'voice-one' } },
    });
    const existingVideo = dependencies.existingVideo as unknown as {
      removeStep: ReturnType<typeof vi.fn>;
      clearVoice: ReturnType<typeof vi.fn>;
      addStep: ReturnType<typeof vi.fn>;
    };

    const handoff = dependencies.handoff as unknown as {
      actions: { clearActiveRecipe: ReturnType<typeof vi.fn> };
    };

    const { rerender } = renderHook(() => useProjectCreativeSessionAdapter(dependencies));
    await waitFor(() => expect(existingVideo.removeStep).toHaveBeenCalledWith(leftoverStep.id));
    expect(existingVideo.clearVoice).toHaveBeenCalled();
    expect(existingVideo.addStep).not.toHaveBeenCalled();
    // The rail reads its own handoff, so without this it would go on presenting the character the
    // save just ended while the Create task, reading the Project, says nothing is chosen.
    expect(handoff.actions.clearActiveRecipe).toHaveBeenCalled();

    // A tool chosen after the save is not checkpointed yet, so re-running must not sweep it away.
    rerender();
    rerender();
    expect(existingVideo.removeStep).toHaveBeenCalledTimes(1);
    expect(handoff.actions.clearActiveRecipe).toHaveBeenCalledTimes(1);
  });

  it('leaves the controls alone while the Project is still being configured', async () => {
    const { dependencies, restoreAspectRatio } = setup({
      snapshot: { selectedVoice: null, visualTreatment: { kind: 'none' } },
      existingVideo: { steps: [leftoverStep] },
    });
    const existingVideo = dependencies.existingVideo as unknown as {
      removeStep: ReturnType<typeof vi.fn>;
    };
    const handoff = dependencies.handoff as unknown as {
      actions: { clearActiveRecipe: ReturnType<typeof vi.fn> };
    };

    renderHook(() => useProjectCreativeSessionAdapter(dependencies));

    // Hydration settling proves the effects ran; no saved output means nothing was freed.
    await waitFor(() => expect(restoreAspectRatio).toHaveBeenCalled());
    expect(existingVideo.removeStep).not.toHaveBeenCalled();
    expect(handoff.actions.clearActiveRecipe).not.toHaveBeenCalled();
  });
});

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

describe('useProjectCreativeSessionAdapter selection propagation', () => {
  beforeEach(() => vi.clearAllMocks());

  const character = {
    id: 'character-one',
    name: 'Ada',
    prompt: 'Ada presenting',
    modelModeId: 'lucy-latest' as const,
    updatedAt: now,
  };

  /** The store and active recipe a rail character pick leaves behind. */
  const withChosenCharacter = (
    dependencies: Parameters<typeof useProjectCreativeSessionAdapter>[0],
  ) => {
    Object.assign(dependencies.repository as object, {
      getSnapshot: () => ({
        store: { ...store, savedCharacterPrompts: [character] },
        health: 'ready',
        notice: null,
      }),
    });
    Object.assign(dependencies.handoff as object, {
      state: { activeRecipe: { origin: 'character-prompt', assetId: character.id } },
      actions: { useRecipe: vi.fn(), clearActiveRecipe: vi.fn(() => true) },
    });
  };

  it('carries a rail selection out to the Project without waiting to be asked', async () => {
    // The whole defect: before this, a character chosen on the rail reached nothing, so the Create
    // task read "Not chosen" and the editor opened on an empty step.
    const { dependencies } = setup({ snapshot: { selectedVoice: null } });
    const session = dependencies.projectSession as unknown as {
      propose: Mock<(proposal: ProjectSessionProposalContract) => boolean>;
    };
    withChosenCharacter(dependencies);

    renderHook(() => useProjectCreativeSessionAdapter(dependencies));

    await waitFor(() => expect(session.propose).toHaveBeenCalled());
    expect(session.propose.mock.calls[0]?.[0].selectedCharacter?.characterId).toBe(character.id);
  });

  it('proposes once for one selection, so writing what it reads cannot loop', async () => {
    const { dependencies } = setup({ snapshot: { selectedVoice: null } });
    const session = dependencies.projectSession as unknown as {
      propose: Mock<(proposal: ProjectSessionProposalContract) => boolean>;
    };
    withChosenCharacter(dependencies);

    const { rerender } = renderHook(() => useProjectCreativeSessionAdapter(dependencies));
    await waitFor(() => expect(session.propose).toHaveBeenCalledTimes(1));
    rerender();
    rerender();
    rerender();
    expect(session.propose).toHaveBeenCalledTimes(1);
  });

  it('stays silent when the Project already holds what the Studio is showing', async () => {
    const { dependencies, restoreAspectRatio } = setup({ snapshot: { selectedVoice: null } });
    const session = dependencies.projectSession as unknown as {
      propose: Mock<(proposal: ProjectSessionProposalContract) => boolean>;
    };
    // Hydration's own job is to bring the Studio into line with the Project; standing in for it
    // here is what makes "already agrees" a real state rather than a mocked one.
    (
      dependencies.studioSession as unknown as {
        capturePreferences: { applied: { aspectRatio: string } };
      }
    ).capturePreferences.applied.aspectRatio = '9:16';

    renderHook(() => useProjectCreativeSessionAdapter(dependencies));

    // Hydration settling proves the effects ran; an unchanged setup writes no revision.
    await waitFor(() => expect(restoreAspectRatio).toHaveBeenCalled());
    expect(session.propose).not.toHaveBeenCalled();
  });
});

describe('useProjectCreativeSessionAdapter after a saved output', () => {
  beforeEach(() => vi.clearAllMocks());

  const character = {
    id: 'character-one',
    name: 'Ada',
    prompt: 'Ada presenting',
    modelModeId: 'lucy-latest' as const,
    updatedAt: now,
  };

  const withStore = (dependencies: Parameters<typeof useProjectCreativeSessionAdapter>[0]) =>
    Object.assign(dependencies.repository as object, {
      getSnapshot: () => ({
        store: { ...store, savedCharacterPrompts: [character] },
        health: 'ready',
        notice: null,
      }),
    });

  it('does not write the ended round back over the output the save just recorded', async () => {
    const { dependencies } = setup({
      snapshot: completedOutputSnapshot,
      existingVideo: { steps: [leftoverStep], voiceSelection: { voiceId: 'voice-one' } },
    });
    const session = dependencies.projectSession as unknown as {
      propose: Mock<(proposal: ProjectSessionProposalContract) => boolean>;
    };
    const existingVideo = dependencies.existingVideo as unknown as {
      removeStep: ReturnType<typeof vi.fn>;
    };
    withStore(dependencies);
    Object.assign(dependencies.handoff as object, {
      state: { activeRecipe: { origin: 'character-prompt', assetId: character.id } },
      actions: { useRecipe: vi.fn(), clearActiveRecipe: vi.fn(() => true) },
    });

    const { rerender } = renderHook(() => useProjectCreativeSessionAdapter(dependencies));
    await waitFor(() => expect(existingVideo.removeStep).toHaveBeenCalledWith(leftoverStep.id));
    // The configuration effect follows the cleared snapshot and drops the voice a tick later.
    Object.assign(dependencies.existingVideo as object, { voiceSelection: null });
    rerender();

    expect(session.propose).not.toHaveBeenCalled();
  });

  it('carries a pick made after the save out to the next round', async () => {
    const { dependencies, restoreAspectRatio } = setup({
      snapshot: { ...completedOutputSnapshot, selectedVoice: null },
    });
    const session = dependencies.projectSession as unknown as {
      propose: Mock<(proposal: ProjectSessionProposalContract) => boolean>;
    };
    withStore(dependencies);

    const { rerender } = renderHook(() => useProjectCreativeSessionAdapter(dependencies));
    await waitFor(() => expect(restoreAspectRatio).toHaveBeenCalled());
    Object.assign(dependencies.handoff as object, {
      state: { activeRecipe: { origin: 'character-prompt', assetId: character.id } },
      actions: { useRecipe: vi.fn(), clearActiveRecipe: vi.fn(() => true) },
    });
    rerender();

    await waitFor(() => expect(session.propose).toHaveBeenCalledTimes(1));
    expect(session.propose.mock.calls[0]?.[0].selectedCharacter?.characterId).toBe(character.id);
  });
});
