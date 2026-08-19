// @vitest-environment jsdom

import { createRef, type ComponentProps } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudioDesignProvider } from '../ui';
import { StudioLifecycleDialogs } from './StudioLifecycleDialogs';

type DialogProps = ComponentProps<typeof StudioLifecycleDialogs>;

const savedVideoId = 'a2b0dfe8-2b1f-4c07-a2a9-2d3d94d9f6a1';
const savedVersionId = 'c5b9b3ab-6c2f-4c1c-92c4-6f2b0e19f0d2';

const dialogProps = (overrides: Partial<DialogProps> = {}): DialogProps => ({
  mainRef: createRef<HTMLElement>(),
  savedVideo: {
    pendingSave: null,
    saveOutcome: null,
    discardPromptOpen: false,
    dismissPendingSave: vi.fn(),
    dismissSaveOutcome: vi.fn(),
    confirmPendingSave: vi.fn(),
    dismissVideoEditDiscard: vi.fn(),
    returnFromVideoEditor: vi.fn(),
    commitVideoEdit: vi.fn(() => Promise.resolve()),
    requestSaveAndCommitVideoEdit: vi.fn(),
  } as unknown as DialogProps['savedVideo'],
  videoEditor: {
    phase: 'idle',
    resumeEditing: vi.fn(),
  } as unknown as DialogProps['videoEditor'],
  projectWorkingMedia: null,
  saveSuccessSuppressed: false,
  onOpenSavedVideosLibrary: vi.fn(),
  onCreateAnotherVideo: vi.fn(),
  ...overrides,
});

const renderDialogs = (props: DialogProps) =>
  render(
    <StudioDesignProvider>
      <main ref={props.mainRef}>
        <StudioLifecycleDialogs {...props} />
      </main>
    </StudioDesignProvider>,
  );

describe('StudioLifecycleDialogs', () => {
  afterEach(cleanup);

  it('adopts validated render preview only through the Project confirmation', async () => {
    const cancel = vi.fn();
    const adoptRenderPreview = vi.fn(() => Promise.resolve());
    const props = dialogProps({
      videoEditor: {
        phase: 'awaiting-replacement',
        resumeEditing: vi.fn(),
      } as unknown as DialogProps['videoEditor'],
      projectWorkingMedia: {
        busy: false,
        message: 'Store this render as the Project working-media checkpoint.',
        cancel,
        adoptRenderPreview,
      } as unknown as DialogProps['projectWorkingMedia'],
    });
    renderDialogs(props);

    expect(
      await screen.findByRole('heading', {
        name: 'Make this render the current cut?',
      }),
    ).toBeVisible();
    expect(
      screen.getAllByText('Store this render as the Project working-media checkpoint.'),
    ).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'Use as the current cut' }));
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));

    expect(adoptRenderPreview).toHaveBeenCalledOnce();
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('keeps non-Project replacement choices explicit', async () => {
    const commitVideoEdit = vi.fn(() => Promise.resolve());
    const requestSaveAndCommitVideoEdit = vi.fn();
    const resumeEditing = vi.fn();
    const props = dialogProps({
      savedVideo: {
        ...dialogProps().savedVideo,
        commitVideoEdit,
        requestSaveAndCommitVideoEdit,
      },
      videoEditor: {
        phase: 'awaiting-replacement',
        resumeEditing,
      } as unknown as DialogProps['videoEditor'],
    });
    renderDialogs(props);

    expect(
      await screen.findByRole('heading', { name: 'Replace the current video?' }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Replace Without Saving' }));
    fireEvent.click(screen.getByRole('button', { name: 'Replace and Save' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(commitVideoEdit).toHaveBeenCalledWith(false);
    expect(requestSaveAndCommitVideoEdit).toHaveBeenCalledOnce();
    expect(resumeEditing).toHaveBeenCalledOnce();
  });
  it('closes the creation loop after an explicit save and stays silent inside a Project context', async () => {
    const dismissSaveOutcome = vi.fn();
    const onOpenSavedVideosLibrary = vi.fn();
    const onCreateAnotherVideo = vi.fn();
    const savedVideo = {
      ...dialogProps().savedVideo,
      saveOutcome: {
        id: savedVideoId,
        title: 'Launch cut',
        status: 'ready',
        currentVersion: {
          id: savedVersionId,
          videoId: savedVideoId,
          ordinal: 1,
          origin: 'recorded',
          characterName: null,
          characterVariantName: null,
          sourceVersionId: null,
          mimeType: 'video/mp4',
          filename: 'launch-cut.mp4',
          sizeBytes: 4,
          durationMs: 1_000,
          width: 1280,
          height: 720,
          createdAt: '2026-08-16T10:00:00.000Z',
        },
        versions: [],
        sourceVideoId: null,
        versionCount: 1,
        thumbnailAvailable: false,
        createdAt: '2026-08-16T10:00:00.000Z',
        updatedAt: '2026-08-16T10:00:00.000Z',
      },
      dismissSaveOutcome,
    } as unknown as DialogProps['savedVideo'];

    renderDialogs(dialogProps({ savedVideo, onOpenSavedVideosLibrary, onCreateAnotherVideo }));

    expect(await screen.findByRole('heading', { name: 'Saved to Assets' })).toBeVisible();
    expect(screen.getByRole('link', { name: /Download/u })).toHaveAttribute(
      'href',
      `/api/videos/${savedVideoId}/versions/${savedVersionId}/content?download=true`,
    );
    fireEvent.click(screen.getByRole('button', { name: 'View in Assets' }));
    expect(onOpenSavedVideosLibrary).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Create another' }));
    expect(onCreateAnotherVideo).toHaveBeenCalledOnce();
    expect(dismissSaveOutcome).toHaveBeenCalledTimes(2);

    cleanup();
    renderDialogs(dialogProps({ savedVideo, saveSuccessSuppressed: true }));

    expect(screen.queryByRole('heading', { name: 'Saved to Assets' })).not.toBeInTheDocument();
  });
});
