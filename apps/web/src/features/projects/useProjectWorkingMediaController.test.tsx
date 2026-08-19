// @vitest-environment jsdom

import type { ProjectCurrentResponse, ProjectWorkingMediaResponse } from '@studio/contracts';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { useVideoEditSession } from '../video-editor/useVideoEditSession';
import type * as ProjectsApi from './projectsApi';
import { ProjectApiConflictError } from './projectsApi';
import type { ProjectSessionPort } from './useProjectSession';
import { useProjectWorkingMediaController } from './useProjectWorkingMediaController';

const api = vi.hoisted(() => ({
  getProjectWorkingMedia: vi.fn(),
  uploadProjectWorkingMedia: vi.fn(),
}));

vi.mock('./projectsApi', async () => {
  const actual = await vi.importActual<typeof ProjectsApi>('./projectsApi');
  return { ...actual, ...api };
});

const projectId = '18b120ac-1578-46e3-8c3d-42307772f391';
const revisionId = '89a972fe-bfb5-4214-94f7-4bd54f12ce06';
const adoptedRevisionId = '4a31b6c7-8a54-4878-b240-182652a34d31';
const sourceAssetId = '79b94c02-d268-4201-a05b-1f3baa0caed1';
const adoptedAssetId = '08ab9b2e-0cb2-4f07-9bed-b931204e1546';
const now = '2026-08-12T16:00:00.000Z';
const editSpec = {
  trim: { startMs: 100, endMs: 900 },
  crop: { preset: 'original' as const, rectangle: { x: 0, y: 0, width: 1, height: 1 } },
  rotation: 0 as const,
  flipHorizontal: false,
  flipVertical: false,
  adjustments: {
    brightness: 0,
    contrast: 0,
    saturation: 0,
    temperature: 0,
    highlights: 0,
    shadows: 0,
  },
  filter: 'warm' as const,
};

const current = (adopted = false): ProjectCurrentResponse => ({
  project: {
    id: projectId,
    campaignId: null,
    title: 'Working Project',
    status: 'ready',
    version: adopted ? 3 : 2,
    currentRevisionId: adopted ? adoptedRevisionId : revisionId,
    currentRevisionNumber: adopted ? 3 : 2,
    archivedAt: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  },
  revision: {
    id: adopted ? adoptedRevisionId : revisionId,
    projectId,
    revisionNumber: adopted ? 3 : 2,
    parentRevisionId: adopted ? revisionId : null,
    parentRevisionNumber: adopted ? 2 : 1,
    snapshot: {
      schemaVersion: 2,
      sourceAssetId,
      workingMedia: { kind: 'asset', assetId: adopted ? adoptedAssetId : sourceAssetId },
      presentedMedia: { kind: 'asset', assetId: adopted ? adoptedAssetId : sourceAssetId },
      selectedCharacter: null,
      selectedOutfit: null,
      selectedVoice: null,
      visualTreatment: { kind: 'none' },
      liveMode: null,
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
      localEdit: adopted ? editSpec : null,
      exportSpecification: null,
      lastSuccessfulOutput: null,
      workflowPhase: adopted ? 'review' : 'creative',
      createdAt: now,
      updatedAt: now,
    },
    authorKind: 'user',
    source: 'user-edit',
    createdAt: now,
  },
});

const response = (): ProjectWorkingMediaResponse => ({
  ...current(true),
  media: {
    kind: 'local-render',
    reference: { kind: 'asset', assetId: adoptedAssetId },
    assetId: adoptedAssetId,
    savedVideoId: null,
    videoVersionId: null,
    mimeType: 'video/mp4',
    filename: 'preview.mp4',
    sizeBytes: 5,
    checksumSha256: 'a'.repeat(64),
    container: 'mp4',
    videoCodec: 'avc',
    audioCodec: null,
    durationMs: 800,
    width: 640,
    height: 360,
    hasAudio: false,
    adoptedRevisionId,
    adoptedRevisionNumber: 3,
    adoptedAt: now,
    contentUrl: `/api/projects/${projectId}/working-media/${adoptedRevisionId}/content`,
  },
  isCurrent: true,
});

const session = (): ProjectSessionPort => {
  const authority = current();
  return {
    projectId,
    phase: 'saved',
    current: authority,
    proposal: null,
    hasLocalProposal: false,
    message: null,
    propose: vi.fn(() => true),
    flush: vi.fn(() => Promise.resolve(true)),
    retry: vi.fn(() => Promise.resolve(true)),
    discard: vi.fn(() => true),
    getCurrent: vi.fn(() => authority),
    acceptCurrent: vi.fn(),
  };
};

const editor = () => {
  const file = new File(['video'], 'preview.mp4', {
    type: 'video/mp4',
    lastModified: 1_786_550_400_000,
  });
  return {
    candidate: {
      validated: {
        file,
        mimeType: 'video/mp4',
        metadata: { selectedAt: now },
      },
      spec: editSpec,
    },
    phase: 'awaiting-replacement',
    completeCommit: vi.fn(),
    close: vi.fn(),
    resumeEditing: vi.fn(),
  } as unknown as ReturnType<typeof useVideoEditSession>;
};

beforeEach(() => {
  api.getProjectWorkingMedia.mockReset();
  api.uploadProjectWorkingMedia.mockReset();
});
afterEach(cleanup);

describe('useProjectWorkingMediaController', () => {
  it('flushes the one Project session and adopts the validated candidate explicitly', async () => {
    const port = session();
    const videoEditor = editor();
    api.uploadProjectWorkingMedia.mockResolvedValue(response());
    const hook = renderHook(() => useProjectWorkingMediaController(projectId, port, videoEditor));

    await act(async () => {
      await expect(hook.result.current.adoptRenderPreview()).resolves.toBe(true);
    });

    expect(port.flush).toHaveBeenCalledOnce();
    expect(api.uploadProjectWorkingMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId,
        file: videoEditor.candidate!.validated.file,
        localEdit: editSpec,
      }),
    );
    expect(port.acceptCurrent).toHaveBeenCalledWith({
      project: response().project,
      revision: response().revision,
    });
    expect(videoEditor.completeCommit).toHaveBeenCalledWith(adoptedAssetId);
    expect(videoEditor.close).toHaveBeenCalledOnce();
    expect(hook.result.current.message).toContain('No video or version was saved');
  });

  it('preserves the temporary candidate and stable operation identity on conflict', async () => {
    const port = session();
    const videoEditor = editor();
    api.uploadProjectWorkingMedia.mockRejectedValue(
      new ProjectApiConflictError('Conflict', {
        kind: 'revision',
        projectId,
        expectedRevisionNumber: 2,
        actualRevisionNumber: 3,
      }),
    );
    const hook = renderHook(() => useProjectWorkingMediaController(projectId, port, videoEditor));

    await act(async () => {
      await expect(hook.result.current.adoptRenderPreview()).resolves.toBe(false);
    });

    expect(hook.result.current.phase).toBe('conflict');
    expect(videoEditor.completeCommit).not.toHaveBeenCalled();
    expect(videoEditor.close).not.toHaveBeenCalled();
    expect(videoEditor.candidate).not.toBeNull();
  });
});
