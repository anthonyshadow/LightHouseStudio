// @vitest-environment jsdom

import { createRef } from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudioDesignProvider } from '../ui';
import { createCreativeAssetRepository } from '../features/creative-assets/repository';
import { CreativeWorkspace, type CreativeWorkspaceProps } from './CreativeWorkspace';

const createProps = (showDesktopAiTools: boolean) =>
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
      hasTake: true,
    },
    actions: {
      onOpenDock: vi.fn(),
      onOpenTake: vi.fn(),
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
      takeToggleRef: createRef<HTMLButtonElement>(),
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
    ).toEqual(['Dock', 'Take', 'Select Character', 'Select Outfit', 'Workshop', 'Shelf']);
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
    ).toEqual(['Dock', 'Take', 'Workshop', 'Shelf']);
  });
});
