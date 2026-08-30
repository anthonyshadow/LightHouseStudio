// @vitest-environment jsdom

import type { ProjectCurrentResponse, ProjectProcessingAttempt } from '@studio/contracts';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RemoteStateTestProvider } from '../../test/RemoteStateTestProvider';
import { StudioDesignProvider } from '../../ui';
import { ProjectCreateTaskPanel, type ProjectCreateRuntime } from './ProjectCreateTaskPanel';
import type { ProjectProcessingController } from './useProjectProcessingController';
import type { ProjectSessionPort } from './useProjectSession';

const ids = {
  project: '18b120ac-1578-46e3-8c3d-42307772f391',
  sourceAsset: '79b94c02-d268-4201-a05b-1f3baa0caed1',
  revision: '89a972fe-bfb5-4214-94f7-4bd54f12ce06',
};
const now = '2026-08-14T12:00:00.000Z';

const current = (
  sourceAssetId: string | null = ids.sourceAsset,
  archivedAt: string | null = null,
): ProjectCurrentResponse => ({
  project: {
    id: ids.project,
    campaignId: null,
    title: 'Create task Project',
    status: archivedAt === null ? 'ready' : 'archived',
    version: 2,
    currentRevisionId: ids.revision,
    currentRevisionNumber: 2,
    archivedAt,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  },
  revision: {
    id: ids.revision,
    projectId: ids.project,
    revisionNumber: 2,
    parentRevisionId: null,
    parentRevisionNumber: null,
    snapshot: {
      schemaVersion: 2,
      sourceAssetId,
      workingMedia: sourceAssetId === null ? null : { kind: 'asset', assetId: sourceAssetId },
      presentedMedia: sourceAssetId === null ? null : { kind: 'asset', assetId: sourceAssetId },
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
      localEdit: null,
      exportSpecification: null,
      lastSuccessfulOutput: null,
      workflowPhase: sourceAssetId === null ? 'source' : 'creative',
      createdAt: now,
      updatedAt: now,
    },
    authorKind: 'user',
    source: 'user-edit',
    createdAt: now,
  },
});

const attempt = (overrides: Partial<ProjectProcessingAttempt> = {}): ProjectProcessingAttempt => ({
  operationId: '2efcc6c3-e82c-419a-8807-c0026170fb75',
  projectId: ids.project,
  capability: 'character-swap',
  attemptNumber: 1,
  retryOfOperationId: null,
  initiatingRevisionId: ids.revision,
  initiatingRevisionNumber: 2,
  phase: 'accepted',
  isCurrent: true,
  ambiguous: false,
  cancellation: 'unsupported',
  retryPolicy: 'not-allowed',
  blocksArchive: true,
  createdAt: now,
  updatedAt: now,
  acceptedAt: now,
  completedAt: null,
  expiresAt: '2026-08-14T13:00:00.000Z',
  nextPollAfterMs: 10_000,
  result: null,
  error: null,
  ...overrides,
});

const processing = (
  overrides: Partial<ProjectProcessingController> = {},
): ProjectProcessingController => ({
  phase: 'idle',
  attempt: null,
  message: null,
  unverifiedOperationId: null,
  busy: false,
  active: false,
  authorityReady: true,
  start: vi.fn(() => Promise.resolve(true)),
  retry: vi.fn(() => Promise.resolve(true)),
  cancel: vi.fn(() => Promise.resolve(true)),
  reconcile: vi.fn(() => Promise.resolve(true)),
  refresh: vi.fn(() => Promise.resolve(true)),
  ...overrides,
});

const session = (): ProjectSessionPort =>
  ({
    current: current(),
    phase: 'saved',
    hasLocalProposal: false,
    propose: vi.fn(() => true),
    flush: vi.fn(() => Promise.resolve(true)),
    getCurrent: vi.fn(() => current()),
    acceptCurrent: vi.fn(),
  }) as unknown as ProjectSessionPort;

const runtime = (overrides: Partial<ProjectCreateRuntime> = {}): ProjectCreateRuntime => ({
  creative: {
    phase: 'idle',
    message: null,
    resourceIssues: [],
    checkpoint: vi.fn(() => Promise.resolve(true)),
  },
  workingMedia: {
    phase: 'idle',
    message: null,
    busy: false,
    adoptRenderPreview: vi.fn(() => Promise.resolve(true)),
    cancel: vi.fn(),
  },
  onLaunch: vi.fn(),
  onChooseAnother: vi.fn(),
  launchingOperation: null,
  characterSwapAvailable: true,
  virtualTryOnAvailable: true,
  visualIncompatibilityReason: null,
  editorBlockedReason: undefined,
  ...overrides,
});

const renderPanel = (props: Partial<Parameters<typeof ProjectCreateTaskPanel>[0]> = {}) => {
  const onOpenSource = vi.fn();
  render(
    <RemoteStateTestProvider>
      <ProjectCreateTaskPanel
        current={current()}
        session={session()}
        archived={false}
        processing={processing()}
        runtime={runtime()}
        sourceBusy={false}
        workingMediaBusy={false}
        onOpenSource={onOpenSource}
        onOpenTask={vi.fn()}
        {...props}
      />
    </RemoteStateTestProvider>,
    { wrapper: StudioDesignProvider },
  );
  return { onOpenSource };
};

afterEach(cleanup);

describe('ProjectCreateTaskPanel', () => {
  it('offers no edit before there is an original video, and says where to get one', async () => {
    const user = userEvent.setup();
    const { onOpenSource } = renderPanel({ current: current(null) });

    expect(screen.getByRole('heading', { name: 'Nothing to create from yet' })).toBeVisible();
    expect(screen.queryAllByRole('button', { name: /^Open /u })).toEqual([]);

    await user.click(screen.getByRole('button', { name: 'Go to Original' }));
    expect(onOpenSource).toHaveBeenCalledOnce();
  });

  it('starts every edit through the editor and never through the processing controller', async () => {
    const user = userEvent.setup();
    const onLaunch = vi.fn();
    const controller = processing();
    renderPanel({ processing: controller, runtime: runtime({ onLaunch }) });

    expect(screen.getByRole('button', { name: 'Open Character Swap' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Open Virtual Try-On' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Open the video editor' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Open Character Swap' }));

    expect(onLaunch).toHaveBeenCalledOnce();
    expect(onLaunch.mock.calls[0]?.[0]).toBe('character-swap');
    expect(onLaunch.mock.calls[0]?.[1]).toBeInstanceOf(HTMLButtonElement);
    // The one cost-acknowledged start lives in the editor; nothing here may reach a provider.
    expect(controller.start).not.toHaveBeenCalled();
  });

  it('names the choice each AI edit consumes on the card that consumes it, once', () => {
    renderPanel({
      current: {
        ...current(),
        revision: {
          ...current().revision,
          snapshot: {
            ...current().revision.snapshot,
            selectedCharacter: {
              characterId: 'a',
              characterLabel: 'Ada',
              characterRevision: now,
              variantId: null,
              variantLabel: null,
              variantRevision: null,
              referenceAssetId: null,
            },
          },
        },
      },
    });

    // Stated beside the operation that uses it, and nowhere else — the separate setup section that
    // repeated all of this is gone.
    expect(screen.getAllByText('Ada')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Change character' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Change outfit' })).toBeEnabled();
    // The on-device editor consumes no creative choice, so it offers no row.
    expect(screen.queryByRole('button', { name: /^Change (?!character|outfit)/u })).toBeNull();
  });

  it('routes a card’s Change action to the surface that owns that choice', async () => {
    const user = userEvent.setup();
    const onChooseAnother = vi.fn();
    renderPanel({ runtime: runtime({ onChooseAnother }) });

    await user.click(screen.getByRole('button', { name: 'Change outfit' }));
    expect(onChooseAnother).toHaveBeenCalledWith('outfit');
  });

  it('shows a pending pick immediately, before the autosave has landed', () => {
    renderPanel({
      session: {
        ...session(),
        proposal: {
          workflowPhase: 'creative',
          liveMode: null,
          selectedCharacter: {
            characterId: 'a',
            characterLabel: 'Just chosen',
            characterRevision: now,
            variantId: null,
            variantLabel: null,
            variantRevision: null,
            referenceAssetId: null,
          },
          selectedOutfit: null,
          selectedVoice: null,
          visualTreatment: { kind: 'character-swap', providerId: null, outputResolution: null },
          creativeIntent: current().revision.snapshot.creativeIntent,
          localEdit: null,
          exportSpecification: null,
        },
      },
    });

    expect(screen.getByText('Just chosen')).toBeVisible();
  });

  it('states that an archived Project is read-only and disables every way to change it', () => {
    renderPanel({ current: current(ids.sourceAsset, now), archived: true });

    expect(screen.getByText('Read-only Project')).toBeVisible();
    // Stated once on screen, but still attached to every control it disables.
    expect(screen.getAllByText(/This Project is archived/u)).toHaveLength(1);
    for (const name of ['Open Character Swap', 'Open Virtual Try-On', 'Open the video editor']) {
      const action = screen.getByRole('button', { name });
      expect(action).toBeDisabled();
      expect(action).toHaveAttribute('title', 'This Project is archived.');
    }
    expect(
      screen.getByRole('button', { name: 'Make a saved video the current cut' }),
    ).toBeDisabled();
  });

  it('holds back only the billable edits while a provider run is unresolved', () => {
    renderPanel({ processing: processing({ attempt: attempt() }) });

    expect(screen.getByRole('button', { name: 'Open Character Swap' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Open Virtual Try-On' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Open the video editor' })).toBeEnabled();
    expect(screen.getAllByText(/accepted provider work is running/u).length).toBeGreaterThan(0);
  });

  it('refuses one operation for its own unconfigured provider and leaves the other alone', () => {
    renderPanel({ runtime: runtime({ characterSwapAvailable: false }) });

    expect(screen.getByRole('button', { name: 'Open Character Swap' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Open Virtual Try-On' })).toBeEnabled();
    expect(screen.getByText(/unavailable in the current server configuration/u)).toBeVisible();
  });

  it('offers no edit without a Studio runtime, and keeps the standing processing notice', () => {
    renderPanel({ runtime: undefined, processing: undefined });

    expect(screen.queryAllByRole('button', { name: /^Open /u })).toEqual([]);
    expect(screen.getByRole('status')).toHaveTextContent('Processing unavailable');
  });

  it('names one current cut once, even though two adoptions can report at the same time', () => {
    renderPanel({
      runtime: runtime({
        workingMedia: {
          phase: 'saved',
          message: 'The current cut is ready.',
          busy: false,
          adoptRenderPreview: vi.fn(() => Promise.resolve(true)),
          cancel: vi.fn(),
        },
      }),
    });

    expect(screen.getAllByText('Edit is now the current cut')).toHaveLength(1);
    expect(screen.queryByText('Current cut updated')).not.toBeInTheDocument();
  });

  it('lets one launch own the section while the editor is opening', () => {
    renderPanel({ runtime: runtime({ launchingOperation: 'virtual-try-on' }) });

    const launching = screen.getByRole('button', { name: 'Open Virtual Try-On' });
    expect(launching).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: 'Open Character Swap' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Open the video editor' })).toBeDisabled();
  });
});
