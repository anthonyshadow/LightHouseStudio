// @vitest-environment jsdom

import type { ProjectCurrentResponse } from '@studio/contracts';
import type { Composition } from '@studio/domain';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CompositionRenderPlan } from '../video-editor/types';
import type * as ProjectsApiModule from './projectsApi';
import type { ProjectSessionPort } from './useProjectSession';
import { useProjectCompositionAdoption } from './useProjectCompositionAdoption';

const projectId = '3f1c9e2a-6d4b-4f8a-9c21-5b7e0d8a4c11';
const assetId = '79b94c02-d268-4201-a05b-1f3baa0caed1';

const mocks = vi.hoisted(() => ({
  upload: vi.fn<(input: unknown) => Promise<unknown>>(),
  read: vi.fn<(projectId: string) => Promise<unknown>>(),
}));
vi.mock('./projectsApi', async () => {
  const actual = await vi.importActual<typeof ProjectsApiModule>('./projectsApi');
  return {
    ...actual,
    uploadProjectWorkingMedia: (input: unknown) => mocks.upload(input),
    getProjectWorkingMedia: (id: string) => mocks.read(id),
  };
});

const plan: CompositionRenderPlan = {
  durationMs: 2_000,
  video: { target: { width: 1_080, height: 1_920 }, clips: ['kept', 'kept'] },
  audio: null,
};

const renderedFrom: Composition = {
  clips: [1, 2].map((index) => ({
    id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    media: { kind: 'asset' as const, assetId },
    trim: { startMs: 0, endMs: 1_000 },
    audio: { level: 100, muted: false },
  })),
  subtitles: [],
};

const file = new File(['stitched bytes'], 'arrangement.mp4', { type: 'video/mp4' });
const render = { file, plan, renderedFrom };

const current = (): ProjectCurrentResponse =>
  ({
    project: { id: projectId, version: 4, currentRevisionNumber: 4 },
    revision: { revisionNumber: 4, snapshot: {} },
  }) as unknown as ProjectCurrentResponse;

/** What the server says about the cut after an adoption of exactly this render landed. */
const landed = (overrides: Record<string, unknown> = {}) => ({
  project: { id: projectId, version: 5, currentRevisionNumber: 5 },
  revision: { revisionNumber: 5, snapshot: { localEdit: null } },
  isCurrent: true,
  media: {
    kind: 'stitched-render',
    reference: { kind: 'asset', assetId },
    adoptedRevisionNumber: 5,
    sizeBytes: file.size,
    width: 1_080,
    height: 1_920,
    hasAudio: false,
    durationMs: 2_000,
    ...overrides,
  },
});

const session = (over: Partial<ProjectSessionPort> = {}): ProjectSessionPort =>
  ({
    projectId,
    flush: () => Promise.resolve(true),
    getCurrent: () => current(),
    acceptCurrent: vi.fn(),
    ...over,
  }) as unknown as ProjectSessionPort;

beforeEach(() => {
  mocks.upload.mockReset();
  mocks.read.mockReset();
});

describe('useProjectCompositionAdoption', () => {
  it('flushes the session, then adopts the stitched file with no single-clip edit', async () => {
    mocks.upload.mockResolvedValue(landed());
    const flush = vi.fn(() => Promise.resolve(true));
    const acceptCurrent = vi.fn();
    const hook = renderHook(() => useProjectCompositionAdoption(session({ flush, acceptCurrent })));

    await act(async () => {
      expect(await hook.result.current.adopt(render)).toBe(true);
    });

    expect(flush).toHaveBeenCalled();
    expect(mocks.upload).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'stitched-render', localEdit: null, file }),
    );
    expect(acceptCurrent).toHaveBeenCalled();
    expect(hook.result.current.phase).toBe('saved');
  });

  it('refuses to adopt over a proposal the session could not write', async () => {
    const hook = renderHook(() =>
      useProjectCompositionAdoption(session({ flush: () => Promise.resolve(false) })),
    );
    await act(async () => {
      expect(await hook.result.current.adopt(render)).toBe(false);
    });
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(hook.result.current.phase).toBe('error');
    expect(hook.result.current.message).toMatch(/pending changes/u);
  });

  it('accepts a lost answer only when the cut the server reports is this render', async () => {
    mocks.upload.mockRejectedValue(new Error('the answer went missing'));
    mocks.read.mockResolvedValue(landed());
    const hook = renderHook(() => useProjectCompositionAdoption(session()));
    await act(async () => {
      expect(await hook.result.current.adopt(render)).toBe(true);
    });
    expect(hook.result.current.phase).toBe('saved');
  });

  it('rejects a lost answer whose cut is somebody else’s, which the old check accepted', async () => {
    /*
     * The single-clip path establishes "my upload landed" by comparing edit specifications. With
     * none on either side that is vacuously true, so an unrelated asset-backed cut — one adopted
     * in another tab, of another length — would have been accepted as this attempt's own.
     */
    mocks.upload.mockRejectedValue(new Error('the answer went missing'));
    mocks.read.mockResolvedValue(landed({ durationMs: 9_000, sizeBytes: 999 }));
    const hook = renderHook(() => useProjectCompositionAdoption(session()));
    await act(async () => {
      expect(await hook.result.current.adopt(render)).toBe(false);
    });
    expect(hook.result.current.phase).toBe('error');
  });

  it('rejects a lost answer that sits at the wrong revision', async () => {
    mocks.upload.mockRejectedValue(new Error('the answer went missing'));
    mocks.read.mockResolvedValue(landed({ adoptedRevisionNumber: 4 }));
    const hook = renderHook(() => useProjectCompositionAdoption(session()));
    await act(async () => {
      expect(await hook.result.current.adopt(render)).toBe(false);
    });
    expect(hook.result.current.phase).toBe('error');
  });
});
