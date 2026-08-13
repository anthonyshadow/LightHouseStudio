import type { ProjectCurrentResponse, ProjectSessionProposalContract } from '@studio/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectApiConflictError } from './projectsApi';
import { ProjectSessionController } from './projectSessionController';

const projectId = '18b120ac-1578-46e3-8c3d-42307772f391';
const firstRevisionId = '89a972fe-bfb5-4214-94f7-4bd54f12ce06';
const nextRevisionId = '4a31b6c7-8a54-4878-b240-182652a34d31';
const now = '2026-08-11T16:00:00.000Z';

const currentProject = (
  overrides: Partial<ProjectCurrentResponse['project']> = {},
): ProjectCurrentResponse => ({
  project: {
    id: projectId,
    campaignId: null,
    title: 'Session Project',
    status: 'draft',
    version: 1,
    currentRevisionId: firstRevisionId,
    currentRevisionNumber: 1,
    archivedAt: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  },
  revision: {
    id: overrides.currentRevisionId ?? firstRevisionId,
    projectId,
    revisionNumber: overrides.currentRevisionNumber ?? 1,
    parentRevisionId: null,
    parentRevisionNumber: null,
    snapshot: {
      schemaVersion: 1,
      sourceAssetId: null,
      workingMedia: null,
      presentedMedia: null,
      selectedCharacter: null,
      selectedOutfit: null,
      selectedVoice: null,
      visualTreatment: { kind: 'none' },
      liveMode: null,
      creativeIntent: { promptId: null, recipeId: null, userIntent: '' },
      localEdit: null,
      exportSpecification: null,
      lastSuccessfulOutput: null,
      workflowPhase: 'source',
      createdAt: now,
      updatedAt: now,
    },
    authorKind: 'user',
    source: 'create',
    createdAt: now,
  },
});

const withProposal = (
  current: ProjectCurrentResponse,
  proposal: ProjectSessionProposalContract,
): ProjectCurrentResponse => ({
  project: {
    ...current.project,
    version: current.project.version + 1,
    currentRevisionId: nextRevisionId,
    currentRevisionNumber: current.project.currentRevisionNumber + 1,
  },
  revision: {
    ...current.revision,
    id: nextRevisionId,
    revisionNumber: current.revision.revisionNumber + 1,
    parentRevisionId: current.revision.id,
    parentRevisionNumber: current.revision.revisionNumber,
    snapshot: { ...current.revision.snapshot, ...proposal },
  },
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('ProjectSessionController', () => {
  it('hydrates once and coalesces compatible semantic proposals at the bounded interval', async () => {
    vi.useFakeTimers();
    let authority = currentProject();
    const publish = vi.fn();
    const save = vi.fn(
      (_id: string, current: ProjectCurrentResponse, proposal: ProjectSessionProposalContract) => {
        authority = withProposal(current, proposal);
        return Promise.resolve(authority);
      },
    );
    const controller = new ProjectSessionController(projectId, {
      load: () => Promise.resolve(authority),
      save,
      publish,
      autosaveMs: 50,
    });
    await controller.hydrate();

    controller.propose({ workflowPhase: 'creative' });
    controller.propose({
      liveMode: {
        modeId: 'local',
        captureFormat: 'portrait',
        audioSource: 'local-microphone',
      },
    });
    expect(controller.getSnapshot()).toMatchObject({ phase: 'dirty', hasLocalProposal: true });
    await vi.advanceTimersByTimeAsync(49);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(save).toHaveBeenCalledOnce();
    expect(publish).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[0]?.[2]).toEqual({
      workflowPhase: 'creative',
      liveMode: {
        modeId: 'local',
        captureFormat: 'portrait',
        audioSource: 'local-microphone',
      },
    });
    expect(controller.getSnapshot()).toMatchObject({ phase: 'saved', hasLocalProposal: false });
  });

  it('reconciles a lost response when server authority already contains the exact proposal', async () => {
    let authority = currentProject();
    const controller = new ProjectSessionController(projectId, {
      load: () => Promise.resolve(authority),
      save: (_id, current, proposal) => {
        authority = withProposal(current, proposal);
        return Promise.reject(new TypeError('response lost'));
      },
      autosaveMs: 10_000,
    });
    await controller.hydrate();
    controller.propose({ workflowPhase: 'creative' });

    await expect(controller.flush()).resolves.toBe(true);
    expect(controller.getSnapshot()).toMatchObject({
      phase: 'saved',
      hasLocalProposal: false,
      current: { project: { version: 2 } },
    });
  });

  it('preserves a stale proposal, reloads authority, and reapplies only after explicit retry', async () => {
    const initial = currentProject();
    const serverCurrent = withProposal(initial, { workflowPhase: 'review', liveMode: null });
    let authority = initial;
    let conflict = true;
    const save = vi.fn(
      (_id: string, current: ProjectCurrentResponse, proposal: ProjectSessionProposalContract) => {
        if (conflict) {
          conflict = false;
          authority = serverCurrent;
          return Promise.reject(
            new ProjectApiConflictError('Refresh the Project.', {
              kind: 'project-version',
              projectId,
              expectedVersion: 1,
              actualVersion: 2,
            }),
          );
        }
        authority = withProposal(current, proposal);
        return Promise.resolve(authority);
      },
    );
    const controller = new ProjectSessionController(projectId, {
      load: () => Promise.resolve(authority),
      save,
      autosaveMs: 10_000,
    });
    await controller.hydrate();
    controller.propose({ workflowPhase: 'creative' });

    await expect(controller.flush()).resolves.toBe(false);
    expect(controller.getSnapshot()).toMatchObject({
      phase: 'conflict',
      hasLocalProposal: true,
      proposal: { workflowPhase: 'creative' },
      current: { project: { version: 2 } },
    });
    expect(save).toHaveBeenCalledOnce();

    await expect(controller.retry()).resolves.toBe(true);
    expect(save).toHaveBeenCalledTimes(2);
    expect(controller.getSnapshot()).toMatchObject({ phase: 'saved', hasLocalProposal: false });
  });

  it('explicitly discards a preserved local proposal without changing server authority', async () => {
    const authority = currentProject();
    const save = vi.fn(
      (_id: string, _current: ProjectCurrentResponse, _proposal: ProjectSessionProposalContract) =>
        Promise.reject(new Error('Unexpected save.')),
    );
    const controller = new ProjectSessionController(projectId, {
      load: () => Promise.resolve(authority),
      save,
      autosaveMs: 10_000,
    });
    await controller.hydrate();
    controller.propose({ workflowPhase: 'creative' });

    expect(controller.discard()).toBe(true);
    expect(controller.getSnapshot()).toMatchObject({ phase: 'saved', hasLocalProposal: false });
    expect(save).not.toHaveBeenCalled();
  });
});
