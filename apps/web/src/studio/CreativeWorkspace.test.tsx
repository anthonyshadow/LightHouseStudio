// @vitest-environment jsdom

import { createRef } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudioDesignProvider } from '../ui';
import { CreativeWorkspace, type CreativeWorkspaceProps } from './CreativeWorkspace';

const createProps = (
  showDesktopAiTools: boolean,
  stateOverrides: Partial<CreativeWorkspaceProps['state']> = {},
) =>
  ({
    state: {
      panel: 'closed' as const,
      activeTool: null,
      showDesktopAiTools,
      activeSessionMode: 'local' as const,
      workshopDrafts: {},
      recordingActive: false,
      sessionModeLocked: false,
      hasReferenceImage: false,
      referenceUsePending: false,
      referenceUseFailure: null,
      hasPlaybackVideo: true,
      ...stateOverrides,
    },
    actions: {
      onOpenEditVideo: vi.fn(),
      onOpenCharacter: vi.fn(),
      onOpenOutfit: vi.fn(),
      onOpenWorkshop: vi.fn(),
      onClose: vi.fn(),
      onWorkshopDraftChange: vi.fn(),
      onUseWorkshop: vi.fn(),
      onSaveWorkshop: vi.fn(),
    },
    refs: {
      workshopToggleRef: createRef<HTMLButtonElement>(),
      editVideoToggleRef: createRef<HTMLButtonElement>(),
      characterToggleRef: createRef<HTMLButtonElement>(),
      outfitToggleRef: createRef<HTMLButtonElement>(),
    },
  }) satisfies CreativeWorkspaceProps;

afterEach(cleanup);

describe('CreativeWorkspace responsive tools', () => {
  it('places Character and Outfit directly before Workshop in the desktop rail', () => {
    render(
      <StudioDesignProvider>
        <CreativeWorkspace {...createProps(true)} />
      </StudioDesignProvider>,
    );
    const rail = screen.getByRole('navigation', { name: 'Creative workspace tools' });
    expect(
      within(rail)
        .getAllByRole('button')
        .map((button) => button.getAttribute('aria-label')),
    ).toEqual(['Edit Video', 'Select Character', 'Select Outfit', 'Workshop']);
  });

  it('keeps the compact row focused on editing and the Prompt Workshop', () => {
    render(
      <StudioDesignProvider>
        <CreativeWorkspace {...createProps(false)} />
      </StudioDesignProvider>,
    );
    const rail = screen.getByRole('navigation', { name: 'Creative workspace tools' });
    expect(
      within(rail)
        .getAllByRole('button')
        .map((button) => button.getAttribute('aria-label')),
    ).toEqual(['Edit Video', 'Workshop']);
  });

  it('enables Edit Video only for inactive playback and invokes the editor action', () => {
    const props = createProps(true);
    const view = render(
      <StudioDesignProvider>
        <CreativeWorkspace {...props} />
      </StudioDesignProvider>,
    );

    const editVideo = screen.getByRole('button', { name: 'Edit Video' });
    expect(editVideo).toBeEnabled();
    fireEvent.click(editVideo);
    expect(props.actions.onOpenEditVideo).toHaveBeenCalledOnce();

    view.rerender(
      <StudioDesignProvider>
        <CreativeWorkspace {...createProps(true, { hasPlaybackVideo: false })} />
      </StudioDesignProvider>,
    );
    expect(screen.getByRole('button', { name: 'Edit Video' })).toBeDisabled();

    view.rerender(
      <StudioDesignProvider>
        <CreativeWorkspace {...createProps(true, { recordingActive: true })} />
      </StudioDesignProvider>,
    );
    expect(screen.getByRole('button', { name: 'Edit Video' })).toBeDisabled();
  });

  it('marks Edit Video as the active dialog launcher while the editor is open', () => {
    render(
      <StudioDesignProvider>
        <CreativeWorkspace {...createProps(true, { activeTool: 'edit-video' })} />
      </StudioDesignProvider>,
    );

    expect(screen.getByRole('button', { name: 'Edit Video' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('disables live-video tools while playback is available for editing', () => {
    const view = render(
      <StudioDesignProvider>
        <CreativeWorkspace {...createProps(true)} />
      </StudioDesignProvider>,
    );

    expect(screen.getByRole('button', { name: 'Select Character' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Select Outfit' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Workshop' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /Shelf|Dock|Recipe/u })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit Video' })).toBeEnabled();

    view.rerender(
      <StudioDesignProvider>
        <CreativeWorkspace {...createProps(true, { hasPlaybackVideo: false })} />
      </StudioDesignProvider>,
    );

    expect(screen.getByRole('button', { name: 'Select Character' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Select Outfit' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Workshop' })).toBeEnabled();
  });

  it('keeps reusable creative setup available beside Project working-media playback', () => {
    render(
      <StudioDesignProvider>
        <CreativeWorkspace {...createProps(true, { liveToolsAvailableDuringPlayback: true })} />
      </StudioDesignProvider>,
    );

    expect(screen.getByRole('button', { name: 'Select Character' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Select Outfit' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Workshop' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: /Shelf|Dock|Recipe/u })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit Video' })).toBeEnabled();
  });

  it('disables the live Workshop button in the compact tool row during playback', () => {
    render(
      <StudioDesignProvider>
        <CreativeWorkspace {...createProps(false)} />
      </StudioDesignProvider>,
    );

    expect(screen.getByRole('button', { name: 'Workshop' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /Shelf|Dock|Recipe/u })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit Video' })).toBeEnabled();
  });
});
