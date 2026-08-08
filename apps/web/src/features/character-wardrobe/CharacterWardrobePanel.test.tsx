// @vitest-environment jsdom

import { ThemeProvider } from '@emotion/react';
import type { EditReferenceImageRequest } from '@studio/contracts';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { studioTheme } from '../../ui';
import type {
  CreativeAssetRepository,
  CreativeAssetStore,
  SavedCharacterPrompt,
} from '../creative-assets/types';
import { CharacterWardrobePanel } from './CharacterWardrobePanel';

const api = vi.hoisted(() => ({
  discardReferenceImage: vi.fn().mockResolvedValue(undefined),
  uploadReferenceImage: vi.fn(),
  createOutfitTryOn: vi.fn(),
  fetchReferenceImageMetadata: vi.fn(),
  editReferenceImage: vi.fn(),
  createReferenceImage: vi.fn(),
  composeReferenceImage: vi.fn(),
  optimizeCharacterReferencePrompt: vi.fn(),
  importRemoteReferenceImage: vi.fn(),
  listWorkspaceVoices: vi.fn(),
  listSharedVoices: vi.fn(),
  saveSharedVoice: vi.fn(),
  removeWorkspaceVoice: vi.fn(),
  fetchVoicePreview: vi.fn(),
}));

vi.mock('../../adapters/api-client/apiClient', () => api);
vi.mock('../../adapters/api-client/voicesApi', () => ({
  listWorkspaceVoices: api.listWorkspaceVoices,
  listSharedVoices: api.listSharedVoices,
  saveSharedVoice: api.saveSharedVoice,
  removeWorkspaceVoice: api.removeWorkspaceVoice,
  fetchVoicePreview: api.fetchVoicePreview,
}));
vi.mock('../../adapters/browser-media/imageValidation', () => ({
  REFERENCE_IMAGE_ACCEPT: 'image/jpeg,image/png,image/webp',
  validateReferenceImage: vi.fn().mockResolvedValue({
    blockingError: null,
    warnings: [],
    width: 512,
    height: 512,
  }),
}));

const character: SavedCharacterPrompt = {
  id: 'character-one',
  name: 'Field host',
  prompt: 'Replace the subject with a field host.',
  source: 'generator',
  promptIntent: 'character-transform',
  builderDraft: null,
  guidedDesign: null,
  referenceImageStatus: 'persisted-reference',
  referenceImageAssetId: 'original-image',
  uploadedReferenceImageAssetId: null,
  finalReferenceKind: 'generated',
  selectedWardrobeVariantId: 'variant-one',
  defaultVoice: null,
  notes: '',
  tags: [],
  createdAt: '2026-08-01T12:00:00.000Z',
  updatedAt: '2026-08-01T12:00:00.000Z',
  lastUsedAt: null,
  useCount: 0,
};
const store: CreativeAssetStore = {
  schemaVersion: 7,
  savedPrompts: [],
  recentPrompts: [],
  savedCharacterPrompts: [character],
  savedCharacterVariants: [
    {
      id: 'variant-one',
      parentCharacterId: character.id,
      title: 'Blue jacket',
      referenceImageAssetId: 'variant-image',
      creation: {
        method: 'add-outfit',
        sourceReferenceImageAssetId: 'original-image',
        garmentReferenceImageAssetId: 'garment-old',
      },
      createdAt: '2026-08-01T12:10:00.000Z',
      updatedAt: '2026-08-01T12:10:00.000Z',
      lastUsedAt: null,
      useCount: 0,
    },
  ],
};

const renderPanel = (overrides: Partial<Parameters<typeof CharacterWardrobePanel>[0]> = {}) => {
  const repository = {
    createSavedCharacterVariant: vi.fn(),
    deleteSavedCharacterVariant: vi.fn(),
    updateSavedCharacterPrompt: vi.fn(),
  } as unknown as CreativeAssetRepository;
  const onUse = vi.fn();
  render(
    <ThemeProvider theme={studioTheme}>
      <CharacterWardrobePanel
        repository={repository}
        store={store}
        character={character}
        addOutfitAvailable
        changeFeaturesAvailable
        onUse={onUse}
        onDirtyChange={vi.fn()}
        onClose={vi.fn()}
        {...overrides}
      />
    </ThemeProvider>,
  );
  return { repository, onUse };
};

describe('CharacterWardrobePanel', () => {
  afterEach(cleanup);
  beforeEach(() => {
    vi.clearAllMocks();
    api.fetchReferenceImageMetadata.mockResolvedValue({ source: 'uploaded' });
    api.listWorkspaceVoices.mockResolvedValue({
      voices: [
        {
          kind: 'workspace',
          voice: {
            voiceId: 'northstar',
            name: 'Northstar',
            category: 'professional',
            description: 'Grounded narration',
            labels: {},
            traits: {
              language: 'en',
              gender: 'female',
              age: 'middle-aged',
              accent: 'Canadian',
              useCase: 'narration',
              descriptive: 'grounded',
            },
            previewAvailable: false,
            removable: true,
          },
        },
      ],
      hasMore: false,
      nextPageToken: null,
      total: 1,
    });
    api.listSharedVoices.mockResolvedValue({ voices: [], hasMore: false, page: 0, total: 0 });
  });

  it('labels the original first and uses only the explicitly chosen version', async () => {
    const user = userEvent.setup();
    const { onUse } = renderPanel();
    const images = screen.getAllByRole('img');
    expect(images[0]).toHaveAttribute('src', '/api/reference-images/original-image/content');
    expect(screen.getByText('Original character')).toBeInTheDocument();
    expect(screen.getByText('Blue jacket')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Use' }));
    expect(onUse).toHaveBeenCalledWith({ characterId: character.id, variantId: null });
  });

  it('confirms before deleting a saved variant and delegates relationship cleanup', async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    const { repository } = renderPanel({ onSaved });

    await user.click(screen.getByRole('button', { name: 'Delete Blue jacket' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete “Blue jacket”?' });
    expect(dialog).toHaveTextContent(
      'Cloud-stored image assets are deleted only when no saved item still uses them',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Delete variant' }));

    expect(repository.deleteSavedCharacterVariant).toHaveBeenCalledWith('variant-one');
    expect(onSaved).toHaveBeenCalledOnce();
  });

  it('keeps prompt-only characters visible and disables both creation paths with guidance', () => {
    const { onUse } = renderPanel({
      character: {
        ...character,
        referenceImageStatus: 'prompt-only',
        referenceImageAssetId: null,
        selectedWardrobeVariantId: null,
        defaultVoice: null,
      },
      store: {
        ...store,
        savedCharacterPrompts: [
          {
            ...character,
            referenceImageStatus: 'prompt-only',
            referenceImageAssetId: null,
            selectedWardrobeVariantId: null,
            defaultVoice: null,
          },
        ],
        savedCharacterVariants: [],
      },
    });

    expect(screen.getByRole('button', { name: 'Add outfit' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Change features' })).toBeDisabled();
    expect(
      screen.getByText(/Add or generate a reference image in Character Builder/u),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Selected' }));
    expect(onUse).toHaveBeenCalledWith({ characterId: character.id, variantId: null });
  });

  it('uploads one garment, generates only from the explicit action, previews, and saves without selecting', async () => {
    const user = userEvent.setup();
    const { repository, onUse } = renderPanel();
    api.uploadReferenceImage.mockResolvedValue({ assetId: 'garment-new' });
    api.createOutfitTryOn.mockResolvedValue({
      assetId: 'result-new',
      source: 'derived',
      provider: 'pruna',
      model: 'p-image-try-on',
    });

    await user.click(screen.getByRole('button', { name: 'Add outfit' }));
    expect(screen.getByRole('heading', { name: 'Generated preview' })).toBeInTheDocument();
    expect(screen.getByText('Your generated outfit preview will appear here.')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Variant name/u })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save variant' })).toBeDisabled();
    expect(
      document.querySelector('[data-scroll-region="character-wardrobe-create"]'),
    ).toBeInTheDocument();
    const garment = new File(['garment'], 'jacket.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByLabelText('Garment image'), { target: { files: [garment] } });
    expect(api.createOutfitTryOn).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Generate outfit' }));
    expect(
      await screen.findByRole('button', { name: 'Open larger generated wardrobe preview' }),
    ).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: /Variant name/u }), 'Evening jacket');
    await user.click(screen.getByRole('button', { name: 'Save variant' }));

    expect(api.uploadReferenceImage).toHaveBeenCalledWith(
      garment,
      expect.any(String),
      expect.any(AbortSignal),
    );
    expect(api.createOutfitTryOn).toHaveBeenCalledWith(
      'variant-image',
      'garment-new',
      expect.any(String),
      expect.any(AbortSignal),
    );
    expect(repository.createSavedCharacterVariant).toHaveBeenCalledWith({
      parentCharacterId: character.id,
      title: 'Evening jacket',
      referenceImageAssetId: 'result-new',
      creation: {
        method: 'add-outfit',
        sourceReferenceImageAssetId: 'variant-image',
        garmentReferenceImageAssetId: 'garment-new',
      },
    });
    expect(onUse).not.toHaveBeenCalled();
  });

  it('uses an image-backed saved outfit as the explicit wardrobe try-on garment', async () => {
    const user = userEvent.setup();
    const { repository } = renderPanel({
      savedOutfits: [
        {
          id: 'saved-coat',
          title: 'Evening coat',
          prompt: '',
          modelModeId: 'lucy-vton-latest',
          source: 'manual',
          referenceImageAssetId: 'saved-coat-image',
          vtonInputKind: 'saved-outfit',
          enhancePrompt: false,
          tags: [],
          createdAt: '2026-08-01T12:00:00.000Z',
          updatedAt: '2026-08-01T12:00:00.000Z',
          lastUsedAt: null,
          useCount: 0,
        },
      ],
    });
    api.createOutfitTryOn.mockResolvedValue({ assetId: 'saved-outfit-result' });

    await user.click(screen.getByRole('button', { name: 'Add outfit' }));
    await user.click(screen.getByRole('button', { name: 'Saved outfit' }));
    await user.click(screen.getByRole('combobox', { name: 'Saved outfit' }));
    await user.click(screen.getByRole('option', { name: /Evening coat/u }));
    await user.click(screen.getByRole('button', { name: 'Generate outfit' }));
    await user.type(screen.getByRole('textbox', { name: /Variant name/u }), 'Coat look');
    await user.click(screen.getByRole('button', { name: 'Save variant' }));

    expect(api.uploadReferenceImage).not.toHaveBeenCalled();
    expect(api.createOutfitTryOn).toHaveBeenCalledWith(
      'variant-image',
      'saved-coat-image',
      expect.any(String),
      expect.any(AbortSignal),
    );
    expect(repository.createSavedCharacterVariant).toHaveBeenCalledWith({
      parentCharacterId: character.id,
      title: 'Coat look',
      referenceImageAssetId: 'saved-outfit-result',
      creation: {
        method: 'add-outfit',
        sourceReferenceImageAssetId: 'variant-image',
        garmentReferenceImageAssetId: 'saved-coat-image',
      },
    });
  });

  it('attaches a saved default voice only after the creator opens voice configuration', async () => {
    const user = userEvent.setup();
    const { repository } = renderPanel({ elevenLabsAvailable: true });

    expect(api.listWorkspaceVoices).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Attach default voice' }));
    await user.click(await screen.findByRole('button', { name: 'Select Northstar' }));

    expect(repository.updateSavedCharacterPrompt).toHaveBeenCalledWith(character.id, {
      defaultVoice: { kind: 'elevenlabs', voiceId: 'northstar', voiceName: 'Northstar' },
    });
  });

  it('sends the parent prompt only when Original is the Change Features source', async () => {
    const user = userEvent.setup();
    renderPanel();
    api.editReferenceImage.mockResolvedValue({
      assetId: 'features-result',
      source: 'generated',
      options: {},
    });

    await user.click(screen.getByRole('button', { name: 'Change features' }));
    const originalCard = screen.getByText('Original character').closest('article');
    if (!originalCard) throw new Error('Expected the original source card.');
    await user.click(within(originalCard).getByRole('button', { name: 'Choose source' }));
    await user.type(screen.getByLabelText('Required changes'), 'Add silver glasses.');
    await user.click(screen.getByRole('button', { name: 'Generate changes' }));
    await waitFor(() => expect(api.editReferenceImage).toHaveBeenCalledOnce());
    expect(api.editReferenceImage).toHaveBeenCalledWith(
      'original-image',
      expect.objectContaining({
        rawPrompt: character.prompt,
        allowDrasticChanges: false,
        changeInstructions: 'Add silver glasses.',
        optimization: { enabled: false },
      }),
      expect.any(AbortSignal),
    );
  });

  it('uses the exact selected variant for Change Features and saves it under the original parent', async () => {
    const user = userEvent.setup();
    const yogaVariant = {
      ...store.savedCharacterVariants[0]!,
      id: 'variant-yoga',
      title: 'Yoga outfit',
      referenceImageAssetId: 'yoga-image',
      useCount: 1,
    };
    const { repository } = renderPanel({
      store: {
        ...store,
        savedCharacterVariants: [...store.savedCharacterVariants, yogaVariant],
      },
    });
    api.editReferenceImage.mockResolvedValue({
      assetId: 'features-yoga-result',
      source: 'generated',
      options: {},
    });

    await user.click(screen.getByRole('button', { name: 'Change features' }));
    const yogaCard = screen.getByText('Yoga outfit').closest('article');
    if (!yogaCard) throw new Error('Expected the Yoga outfit source card.');
    await user.click(within(yogaCard).getByRole('button', { name: 'Choose source' }));
    await user.type(screen.getByLabelText('Required changes'), 'Add a warm expression.');
    await user.click(screen.getByRole('button', { name: 'Generate changes' }));

    await waitFor(() => expect(api.editReferenceImage).toHaveBeenCalledOnce());
    expect(api.editReferenceImage).toHaveBeenCalledWith(
      'yoga-image',
      expect.objectContaining({
        sourcePromptMode: 'image-only',
        allowDrasticChanges: false,
        changeInstructions: 'Add a warm expression.',
      }),
      expect.any(AbortSignal),
    );
    expect(api.editReferenceImage.mock.calls[0]?.[1]).not.toHaveProperty('rawPrompt');
    await user.type(screen.getByRole('textbox', { name: /Variant name/u }), 'Yoga smile');
    await user.click(screen.getByRole('button', { name: 'Save variant' }));
    expect(repository.createSavedCharacterVariant).toHaveBeenCalledWith({
      parentCharacterId: character.id,
      title: 'Yoga smile',
      referenceImageAssetId: 'features-yoga-result',
      creation: {
        method: 'change-features',
        sourceReferenceImageAssetId: 'yoga-image',
        changeInstructions: 'Add a warm expression.',
      },
    });
  });

  it('keeps drastic changes off by default and opts into image-authoritative generation', async () => {
    const user = userEvent.setup();
    renderPanel();
    api.editReferenceImage.mockResolvedValue({
      assetId: 'drastic-result',
      source: 'generated',
      options: {},
    });

    await user.click(screen.getByRole('button', { name: 'Change features' }));
    const originalCard = screen.getByText('Original character').closest('article');
    if (!originalCard) throw new Error('Expected the original source card.');
    await user.click(within(originalCard).getByRole('button', { name: 'Choose source' }));
    const checkbox = screen.getByRole('checkbox', {
      name: /Allow major departure from source/u,
    });
    expect(checkbox).not.toBeChecked();
    await user.click(checkbox);
    await user.type(screen.getByLabelText('Required changes'), 'Create a crystalline alien being.');
    await user.click(screen.getByRole('button', { name: 'Generate changes' }));

    await waitFor(() => expect(api.editReferenceImage).toHaveBeenCalledOnce());
    const request = api.editReferenceImage.mock.calls[0]?.[1] as
      EditReferenceImageRequest | undefined;
    expect(request).toMatchObject({
      sourcePromptMode: 'image-only',
      allowDrasticChanges: true,
      changeInstructions: 'Create a crystalline alien being.',
    });
    expect(request).not.toHaveProperty('rawPrompt');
  });
});
