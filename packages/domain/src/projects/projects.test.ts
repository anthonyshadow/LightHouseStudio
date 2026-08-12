import { describe, expect, it } from 'vitest';
import {
  appendProjectRevision,
  archiveProject,
  canTransitionProjectStatus,
  createEmptyProjectSnapshot,
  createProject,
  deleteProject,
  deriveProjectStatus,
  isProjectResumable,
  moveProjectToCampaign,
  ProjectRuleError,
  renameProject,
  restoreProject,
  validateProjectSnapshot,
} from './index';

const projectId = '18b120ac-1578-46e3-8c3d-42307772f391';
const ownerUserId = '8565ab6c-70ee-409c-bb0a-ff08b7c98070';
const firstRevisionId = '3ac244b9-ec36-4a1e-b95e-7bcf37eb0b2d';
const secondRevisionId = '4159225b-60f4-4f94-a3d5-08feee91a91d';
const sourceAssetId = '79b94c02-d268-4201-a05b-1f3baa0caed1';
const now = '2026-08-11T12:00:00.000Z';
const later = '2026-08-11T12:05:00.000Z';
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

  it('keeps visual processing choices mutually exclusive and rejects browser URLs', () => {
    const snapshot = createEmptyProjectSnapshot(now);
    expect(() =>
      validateProjectSnapshot({
        ...snapshot,
        visualTreatment: { kind: 'character-swap' },
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
        selectedCharacter: { characterId: 'character-one', variantId: null },
        selectedOutfit: { outfitId: 'outfit-one' },
        visualTreatment: { kind: 'virtual-try-on' },
      }).visualTreatment,
    ).toEqual({ kind: 'virtual-try-on' });
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
});
