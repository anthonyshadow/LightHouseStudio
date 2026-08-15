import { describe, expect, it } from 'vitest';
import {
  acceptProjectSource,
  adoptProjectWorkingMedia,
  appendProjectRevision,
  archiveProject,
  canTransitionProjectStatus,
  createEmptyProjectSnapshot,
  createProject,
  createProjectAssetMembership,
  deleteProject,
  deriveProjectStatus,
  isProjectResumable,
  moveProjectToCampaign,
  promoteProjectJobResult,
  ProjectRuleError,
  renameProject,
  restoreProject,
  saveProjectOutput,
  validateProjectSnapshot,
} from './index';
import { createDefaultVideoEditSpec } from '../video-editing';

const projectId = '18b120ac-1578-46e3-8c3d-42307772f391';
const ownerUserId = '8565ab6c-70ee-409c-bb0a-ff08b7c98070';
const firstRevisionId = '3ac244b9-ec36-4a1e-b95e-7bcf37eb0b2d';
const secondRevisionId = '4159225b-60f4-4f94-a3d5-08feee91a91d';
const sourceAssetId = '79b94c02-d268-4201-a05b-1f3baa0caed1';
const now = '2026-08-11T12:00:00.000Z';
const later = '2026-08-11T12:05:00.000Z';
const latest = '2026-08-11T12:10:00.000Z';
const emptyFacts = {
  sourceStatus: 'none',
  currentAttempt: { status: 'none' },
  validatedLastSuccessfulOutput: null,
} as const;
const readyFacts = { ...emptyFacts, sourceStatus: 'ready' } as const;

const emptyProject = () =>
  createProject(
    {
      id: projectId,
      ownerUserId,
      title: '  Summer\u0000   Campaign  ',
      author: { kind: 'user', authorId: ownerUserId },
      facts: emptyFacts,
    },
    { now, createId: () => firstRevisionId },
  );

describe('Project aggregate rules', () => {
  it('creates a non-owning Project Asset membership without a Recipe kind', () => {
    expect(
      createProjectAssetMembership({
        id: '08707aa5-7b7f-4ce1-a48e-647370f6d3ab',
        projectId,
        ownerUserId,
        kind: 'video',
        resourceId: 'ea77cbd9-c453-4f58-a9a0-42bf8aaef338',
        createdAt: now,
      }),
    ).toMatchObject({ projectId, ownerUserId, kind: 'video' });
  });

  it('creates an empty named Project with one immutable initial revision', () => {
    const aggregate = emptyProject();

    expect(aggregate.project).toMatchObject({
      title: 'Summer Campaign',
      status: 'draft',
      version: 1,
      currentRevisionId: firstRevisionId,
      currentRevisionNumber: 1,
    });
    expect(aggregate.revisions).toEqual([
      expect.objectContaining({
        id: firstRevisionId,
        revisionNumber: 1,
        parentRevisionId: null,
        parentRevisionNumber: null,
        source: 'create',
      }),
    ]);
    expect(aggregate.revisions[0]?.snapshot).toEqual(createEmptyProjectSnapshot(now));
  });

  it('derives status from durable source, jobs, failures, outputs, and lifecycle', () => {
    const noOutput = { lastSuccessfulOutput: null };
    const output = {
      savedVideoId: 'ea77cbd9-c453-4f58-a9a0-42bf8aaef338',
      videoVersionId: 'b276694b-58c4-40d3-8fb6-315e32b66fd0',
    };
    expect(deriveProjectStatus(noOutput, emptyFacts)).toBe('draft');
    expect(deriveProjectStatus(noOutput, readyFacts)).toBe('ready');
    expect(
      deriveProjectStatus(noOutput, {
        ...readyFacts,
        currentAttempt: { status: 'active', jobId: secondRevisionId },
      }),
    ).toBe('processing');
    expect(
      deriveProjectStatus(noOutput, {
        ...readyFacts,
        currentAttempt: { status: 'failed', jobId: secondRevisionId },
      }),
    ).toBe('needs-attention');
    expect(
      deriveProjectStatus(noOutput, {
        ...readyFacts,
        currentAttempt: { status: 'succeeded', jobId: secondRevisionId },
      }),
    ).toBe('ready');
    expect(
      deriveProjectStatus(
        { lastSuccessfulOutput: output },
        { ...readyFacts, validatedLastSuccessfulOutput: output },
      ),
    ).toBe('completed');
    expect(deriveProjectStatus(noOutput, readyFacts, { archivedAt: later, deletedAt: null })).toBe(
      'archived',
    );
    expect(deriveProjectStatus(noOutput, readyFacts, { archivedAt: later, deletedAt: later })).toBe(
      'deleted',
    );
  });

  it('requires durable accepted source identity before claiming resume', () => {
    const snapshot = { ...createEmptyProjectSnapshot(now), sourceAssetId };
    const aggregate = createProject(
      {
        id: projectId,
        ownerUserId,
        title: 'Summer Campaign',
        snapshot,
        author: { kind: 'user', authorId: ownerUserId },
        facts: readyFacts,
      },
      { now, createId: () => firstRevisionId },
    );

    expect(isProjectResumable(aggregate.project, snapshot, readyFacts)).toBe(true);
    expect(
      isProjectResumable(aggregate.project, snapshot, {
        ...readyFacts,
        sourceStatus: 'unavailable',
      }),
    ).toBe(false);
    expect(() =>
      createProject(
        {
          id: projectId,
          ownerUserId,
          title: 'Unsafe resume',
          snapshot,
          author: { kind: 'user', authorId: ownerUserId },
          facts: { ...readyFacts, sourceStatus: 'unavailable' },
        },
        { now, createId: () => firstRevisionId },
      ),
    ).toThrow(ProjectRuleError);
  });

  it('keeps the producing revision distinct from the completed post-save output revision', () => {
    const accepted = acceptProjectSource(
      emptyProject(),
      {
        expectedProjectVersion: 1,
        expectedRevisionNumber: 1,
        assetId: sourceAssetId,
        mediaReference: { kind: 'asset', assetId: sourceAssetId },
        author: { kind: 'user', authorId: ownerUserId },
      },
      { now: later, createId: () => secondRevisionId },
    );
    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;
    const outputRevisionId = '5354b1d3-4022-4c85-a7b6-b230b58ba10b';
    const savedVideoId = 'ea77cbd9-c453-4f58-a9a0-42bf8aaef338';
    const videoVersionId = 'b276694b-58c4-40d3-8fb6-315e32b66fd0';

    const saved = saveProjectOutput(
      accepted.value,
      {
        expectedProjectVersion: 2,
        expectedRevisionNumber: 2,
        savedVideoId,
        videoVersionId,
        author: { kind: 'user', authorId: ownerUserId },
      },
      { now: latest, createId: () => outputRevisionId },
    );

    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.value.outputLinks).toContainEqual(
      expect.objectContaining({
        savedVideoId,
        videoVersionId,
        producingRevisionId: secondRevisionId,
        producingRevisionNumber: 2,
      }),
    );
    expect(saved.value.project).toMatchObject({
      status: 'completed',
      currentRevisionId: outputRevisionId,
      currentRevisionNumber: 3,
    });
    expect(saved.value.revisions.at(-1)).toMatchObject({
      id: outputRevisionId,
      parentRevisionId: secondRevisionId,
      source: 'output-save',
      snapshot: {
        workingMedia: { kind: 'saved-video-version', savedVideoId, videoVersionId },
        presentedMedia: { kind: 'saved-video-version', savedVideoId, videoVersionId },
        lastSuccessfulOutput: { savedVideoId, videoVersionId },
        workflowPhase: 'complete',
      },
    });
  });

  it('keeps visual processing choices mutually exclusive and rejects browser URLs', () => {
    const snapshot = createEmptyProjectSnapshot(now);
    expect(() =>
      validateProjectSnapshot({
        ...snapshot,
        visualTreatment: {
          kind: 'character-swap',
          providerId: null,
          outputResolution: null,
        },
      }),
    ).toThrow('requires a selected character');
    expect(() =>
      validateProjectSnapshot({
        ...snapshot,
        sourceAssetId: 'blob:browser-only',
      }),
    ).toThrow('durable identifier');
    expect(
      validateProjectSnapshot({
        ...snapshot,
        selectedCharacter: {
          characterId: 'character-one',
          characterLabel: 'Character One',
          characterRevision: now,
          variantId: null,
          variantLabel: null,
          variantRevision: null,
          referenceAssetId: null,
        },
        selectedOutfit: null,
        visualTreatment: {
          kind: 'virtual-try-on',
          providerId: null,
          outputResolution: null,
          inputKind: 'prompt',
          enhancePrompt: false,
        },
      }).visualTreatment,
    ).toMatchObject({ kind: 'virtual-try-on', inputKind: 'prompt' });
    expect(() =>
      validateProjectSnapshot({
        ...snapshot,
        visualTreatment: {
          kind: 'virtual-try-on',
          providerId: null,
          outputResolution: null,
          inputKind: 'saved-outfit',
          enhancePrompt: false,
        },
      }),
    ).toThrow('requires a selected outfit');
  });

  it('appends monotonic immutable revisions and reports both CAS conflict kinds', () => {
    const initial = emptyProject();
    const nextSnapshot = {
      ...initial.revisions[0]!.snapshot,
      sourceAssetId,
      workingMedia: { kind: 'asset' as const, assetId: sourceAssetId },
      presentedMedia: { kind: 'asset' as const, assetId: sourceAssetId },
      workflowPhase: 'creative' as const,
      updatedAt: later,
    };
    const appended = appendProjectRevision(
      initial,
      {
        expectedProjectVersion: 1,
        expectedRevisionNumber: 1,
        snapshot: nextSnapshot,
        author: { kind: 'user', authorId: ownerUserId },
        source: 'user-edit',
        facts: readyFacts,
      },
      { now: later, createId: () => secondRevisionId },
    );

    expect(appended).toMatchObject({
      ok: true,
      value: {
        project: {
          status: 'ready',
          version: 2,
          currentRevisionId: secondRevisionId,
          currentRevisionNumber: 2,
        },
        revisions: [
          { id: firstRevisionId, revisionNumber: 1 },
          {
            id: secondRevisionId,
            revisionNumber: 2,
            parentRevisionId: firstRevisionId,
            parentRevisionNumber: 1,
          },
        ],
      },
    });
    expect(initial.revisions).toHaveLength(1);
    expect(
      appendProjectRevision(
        initial,
        {
          expectedProjectVersion: 9,
          expectedRevisionNumber: 1,
          snapshot: nextSnapshot,
          author: { kind: 'user', authorId: ownerUserId },
          source: 'user-edit',
          facts: readyFacts,
        },
        { now: later, createId: () => secondRevisionId },
      ),
    ).toMatchObject({ ok: false, conflict: { kind: 'project-version', actualVersion: 1 } });
    expect(
      appendProjectRevision(
        initial,
        {
          expectedProjectVersion: 1,
          expectedRevisionNumber: 9,
          snapshot: nextSnapshot,
          author: { kind: 'user', authorId: ownerUserId },
          source: 'user-edit',
          facts: readyFacts,
        },
        { now: later, createId: () => secondRevisionId },
      ),
    ).toMatchObject({ ok: false, conflict: { kind: 'revision', actualRevisionNumber: 1 } });
  });

  it('accepts one ready immutable source and preserves exact source lineage without a save target', () => {
    const initial = emptyProject();
    const savedVideoId = 'ea77cbd9-c453-4f58-a9a0-42bf8aaef338';
    const videoVersionId = 'b276694b-58c4-40d3-8fb6-315e32b66fd0';
    const accepted = acceptProjectSource(
      initial,
      {
        expectedProjectVersion: 1,
        expectedRevisionNumber: 1,
        assetId: sourceAssetId,
        mediaReference: { kind: 'saved-video-version', savedVideoId, videoVersionId },
        author: { kind: 'user', authorId: ownerUserId },
      },
      { now: later, createId: () => secondRevisionId },
    );

    expect(accepted).toMatchObject({
      ok: true,
      value: {
        project: { status: 'ready', version: 2, currentRevisionNumber: 2 },
        revisions: [
          {},
          {
            snapshot: {
              sourceAssetId,
              workingMedia: { kind: 'saved-video-version', savedVideoId, videoVersionId },
              presentedMedia: { kind: 'saved-video-version', savedVideoId, videoVersionId },
              lastSuccessfulOutput: null,
              workflowPhase: 'creative',
            },
          },
        ],
      },
    });
    if (!accepted.ok) throw new Error('Expected Project source acceptance.');
    expect(
      acceptProjectSource(
        accepted.value,
        {
          expectedProjectVersion: 2,
          expectedRevisionNumber: 2,
          assetId: '65cd938f-5ff6-4730-953b-4137136354c7',
          mediaReference: {
            kind: 'asset',
            assetId: '65cd938f-5ff6-4730-953b-4137136354c7',
          },
          author: { kind: 'user', authorId: ownerUserId },
        },
        { now: later, createId: () => '80eb98cb-0dd4-4aac-8507-084789045d71' },
      ),
    ).toEqual({ ok: false, conflict: { kind: 'immutable-source', projectId } });
  });

  it('adopts validated working media without replacing the immutable original or creating output provenance', () => {
    const accepted = acceptProjectSource(
      emptyProject(),
      {
        expectedProjectVersion: 1,
        expectedRevisionNumber: 1,
        assetId: sourceAssetId,
        mediaReference: { kind: 'asset', assetId: sourceAssetId },
        author: { kind: 'user', authorId: ownerUserId },
      },
      { now: later, createId: () => secondRevisionId },
    );
    if (!accepted.ok) throw new Error('Expected Project source acceptance.');
    const workingAssetId = '65cd938f-5ff6-4730-953b-4137136354c7';
    const edit = createDefaultVideoEditSpec(10_000);
    const adopted = adoptProjectWorkingMedia(
      accepted.value,
      {
        expectedProjectVersion: 2,
        expectedRevisionNumber: 2,
        mediaReference: { kind: 'asset', assetId: workingAssetId },
        localEdit: edit,
        author: { kind: 'user', authorId: ownerUserId },
      },
      { now: latest, createId: () => '80eb98cb-0dd4-4aac-8507-084789045d71' },
    );

    expect(adopted).toMatchObject({
      ok: true,
      value: {
        project: { status: 'ready', version: 3, currentRevisionNumber: 3 },
        revisions: [
          {},
          {},
          {
            snapshot: {
              sourceAssetId,
              workingMedia: { kind: 'asset', assetId: workingAssetId },
              presentedMedia: { kind: 'asset', assetId: workingAssetId },
              localEdit: edit,
              lastSuccessfulOutput: null,
              workflowPhase: 'review',
            },
          },
        ],
        outputLinks: [],
      },
    });
  });

  it('clears a completed pointer when a later revision changes material working state', () => {
    const output = {
      savedVideoId: 'ea77cbd9-c453-4f58-a9a0-42bf8aaef338',
      videoVersionId: 'b276694b-58c4-40d3-8fb6-315e32b66fd0',
    };
    const snapshot = {
      ...createEmptyProjectSnapshot(now),
      sourceAssetId,
      workingMedia: { kind: 'asset' as const, assetId: sourceAssetId },
      lastSuccessfulOutput: output,
    };
    const initial = createProject(
      {
        id: projectId,
        ownerUserId,
        title: 'Completed Project',
        snapshot,
        author: { kind: 'user', authorId: ownerUserId },
        facts: { ...readyFacts, validatedLastSuccessfulOutput: output },
      },
      { now, createId: () => firstRevisionId },
    );

    const appended = appendProjectRevision(
      initial,
      {
        expectedProjectVersion: 1,
        expectedRevisionNumber: 1,
        snapshot: {
          ...snapshot,
          creativeIntent: { ...snapshot.creativeIntent, userIntent: 'A material change' },
          updatedAt: later,
        },
        author: { kind: 'user', authorId: ownerUserId },
        source: 'user-edit',
        facts: { ...readyFacts, validatedLastSuccessfulOutput: output },
      },
      { now: later, createId: () => secondRevisionId },
    );

    expect(appended).toMatchObject({
      ok: true,
      value: {
        project: { status: 'ready' },
        revisions: [{}, { snapshot: { lastSuccessfulOutput: null } }],
      },
    });
  });

  it('uses project version CAS for rename and archive-first deletion', () => {
    const initial = emptyProject().project;
    expect(renameProject(initial, 'Campaign 2027', 9, later)).toMatchObject({
      ok: false,
      conflict: { kind: 'project-version' },
    });
    const renamed = renameProject(initial, 'Campaign 2027', 1, later);
    expect(renamed).toMatchObject({ ok: true, value: { title: 'Campaign 2027', version: 2 } });
    if (!renamed.ok) throw new Error('Expected rename to succeed.');
    expect(() => deleteProject(renamed.value, 2, 'permanent-delete', later)).toThrow(
      'Archive the project',
    );
    expect(() =>
      archiveProject(
        renamed.value,
        2,
        { currentAttempt: { status: 'active', jobId: secondRevisionId } },
        later,
      ),
    ).toThrow('Active Project work');
    const archived = archiveProject(renamed.value, 2, readyFacts, later);
    if (!archived.ok) throw new Error('Expected archive to succeed.');
    expect(() => deleteProject(archived.value, 3, null, later)).toThrow('explicit confirmation');
    const restored = restoreProject(
      archived.value,
      3,
      { lastSuccessfulOutput: null },
      emptyFacts,
      later,
    );
    expect(restored).toMatchObject({ ok: true, value: { status: 'draft', archivedAt: null } });
    const deleted = deleteProject(archived.value, 3, 'permanent-delete', later);
    expect(deleted).toMatchObject({
      ok: true,
      value: { status: 'deleted', archivedAt: later, deletedAt: later, version: 4 },
    });
    expect(canTransitionProjectStatus('deleted', 'draft')).toBe(false);
  });

  it('moves and detaches optional Campaign membership through Project CAS', () => {
    const initial = emptyProject().project;
    const campaignId = 'f5029fb5-d0a1-4cc0-ad4f-f0ce43b0e0b2';
    expect(initial.campaignId).toBeNull();
    expect(moveProjectToCampaign(initial, campaignId, 9, later)).toMatchObject({
      ok: false,
      conflict: { kind: 'project-version', actualVersion: 1 },
    });
    const moved = moveProjectToCampaign(initial, campaignId, 1, later);
    expect(moved).toMatchObject({
      ok: true,
      value: { campaignId, version: 2, currentRevisionId: firstRevisionId },
    });
    if (!moved.ok) throw new Error('Expected Campaign membership move.');
    expect(moveProjectToCampaign(moved.value, null, 2, later)).toMatchObject({
      ok: true,
      value: { campaignId: null, version: 3 },
    });
  });

  it('promotes only the latest result for the exact initiating revision', () => {
    const initial = emptyProject();
    const assetId = 'e5029fb5-d0a1-4cc0-ad4f-f0ce43b0e0b2';
    const promoted = promoteProjectJobResult(
      initial,
      {
        expectedProjectVersion: 1,
        expectedRevisionNumber: 1,
        initiatingRevisionId: firstRevisionId,
        initiatingRevisionNumber: 1,
        operationIsCurrent: true,
        operationId: 'op-1',
        assetId,
        author: { kind: 'system', authorId: 'project-processing' },
      },
      { now: later, createId: () => secondRevisionId },
    );
    expect(promoted).toMatchObject({
      kind: 'promoted',
      value: {
        project: { status: 'draft', currentRevisionId: secondRevisionId },
        revisions: [
          {},
          {
            source: 'job-result',
            snapshot: {
              workingMedia: { kind: 'asset', assetId },
              presentedMedia: { kind: 'asset', assetId },
              workflowPhase: 'review',
            },
          },
        ],
      },
    });

    expect(
      promoteProjectJobResult(
        initial,
        {
          expectedProjectVersion: 1,
          expectedRevisionNumber: 1,
          initiatingRevisionId: firstRevisionId,
          initiatingRevisionNumber: 1,
          operationIsCurrent: false,
          operationId: 'op-1',
          assetId,
          author: { kind: 'system', authorId: 'project-processing' },
        },
        { now: later, createId: () => secondRevisionId },
      ),
    ).toEqual({ kind: 'stale' });
  });
});
