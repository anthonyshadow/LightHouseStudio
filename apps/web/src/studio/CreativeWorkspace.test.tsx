// @vitest-environment jsdom

import { createRef } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudioDesignProvider } from '../ui';
import { createCreativeAssetRepository } from '../features/creative-assets/repository';
import { CreativeWorkspace, type CreativeWorkspaceProps } from './CreativeWorkspace';

const createProps = (
  showDesktopAiTools: boolean,
  stateOverrides: Partial<CreativeWorkspaceProps['state']> = {},
) =>
  ({
    repository: createCreativeAssetRepository({ storage: null }),
    state: {
      panel: 'closed' as const,
      activeTool: null,
      showDesktopAiTools,
      activeSessionMode: 'local' as const,
      libraryMode: 'lucy-latest' as const,
      workshopDrafts: {},
      recordingActive: false,
      sessionModeLocked: false,
      recipeInsertionBlocked: false,
      hasReferenceImage: false,
      referenceUsePending: false,
      referenceUseFailure: null,
      recipeShelfEntryIntent: null,
      hasPlaybackVideo: true,
      ...stateOverrides,
    },
    actions: {
      onOpenDock: vi.fn(),
      onOpenEditVideo: vi.fn(),
      onOpenCharacter: vi.fn(),
      onOpenOutfit: vi.fn(),
      onOpenWorkshop: vi.fn(),
      onToggleShelf: vi.fn(),
      onClose: vi.fn(),
      onLibraryModeChange: vi.fn(),
      onWorkshopDraftChange: vi.fn(),
      onUseWorkshop: vi.fn(),
      onSaveWorkshop: vi.fn(),
      onShelfDirtyChange: vi.fn(),
      onRecipeShelfEntryIntentConsumed: vi.fn(),
      onUseRecipe: vi.fn(),
      onCreateCharacter: vi.fn(),
      onEditCharacter: vi.fn(),
      onCreateOutfit: vi.fn(),
      onEditOutfit: vi.fn(),
      onSaveOutfitCopy: vi.fn(),
      onOpenSavedWorkshop: vi.fn(),
    },
    refs: {
      workshopToggleRef: createRef<HTMLButtonElement>(),
      shelfToggleRef: createRef<HTMLButtonElement>(),
      dockToggleRef: createRef<HTMLButtonElement>(),
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
    ).toEqual(['Dock', 'Edit Video', 'Select Character', 'Select Outfit', 'Workshop', 'Shelf']);
  });

  it('keeps the four-button phone and tablet row unchanged', () => {
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
    ).toEqual(['Dock', 'Edit Video', 'Workshop', 'Shelf']);
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
    expect(screen.getByRole('button', { name: 'Shelf' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Edit Video' })).toBeEnabled();

    view.rerender(
      <StudioDesignProvider>
        <CreativeWorkspace {...createProps(true, { hasPlaybackVideo: false })} />
      </StudioDesignProvider>,
    );

    expect(screen.getByRole('button', { name: 'Select Character' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Select Outfit' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Workshop' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Shelf' })).toBeEnabled();
  });

  it('disables the live Workshop and Shelf buttons in the compact tool row during playback', () => {
    render(
      <StudioDesignProvider>
        <CreativeWorkspace {...createProps(false)} />
      </StudioDesignProvider>,
    );

    expect(screen.getByRole('button', { name: 'Workshop' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Shelf' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Edit Video' })).toBeEnabled();
  });
});
