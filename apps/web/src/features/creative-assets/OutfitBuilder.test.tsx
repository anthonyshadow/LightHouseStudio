// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StudioDesignProvider } from '../../ui';
import type { CreativeAssetRepository, SavedPrompt } from './types';
import { OutfitBuilder } from './OutfitBuilder';

const uploadReferenceImage = vi.hoisted(() => vi.fn());
const validateReferenceImage = vi.hoisted(() => vi.fn());

vi.mock('../../adapters/api-client/apiClient', () => ({ uploadReferenceImage }));
vi.mock('../../adapters/browser-media/imageValidation', () => ({ validateReferenceImage }));
vi.mock('../existing-video/ExistingVideoReferenceField', () => ({
  ExistingVideoReferenceField: ({ onSelectFile }: { onSelectFile: (file: File) => void }) => (
    <button
      type="button"
      onClick={() => onSelectFile(new File(['image'], 'coat.png', { type: 'image/png' }))}
    >
      Choose test image
    </button>
  ),
}));

const saved = (overrides: Partial<SavedPrompt> = {}): SavedPrompt => ({
  id: 'saved-outfit',
  title: 'Copper coat',
  prompt: 'A copper field coat.',
  modelModeId: 'lucy-vton-latest',
  source: 'manual',
  referenceImageAssetId: null,
  vtonInputKind: 'prompt',
  enhancePrompt: true,
  tags: [],
  createdAt: '2026-08-02T12:00:00.000Z',
  updatedAt: '2026-08-02T12:00:00.000Z',
  lastUsedAt: null,
  useCount: 0,
  ...overrides,
});

const renderBuilder = (repository: CreativeAssetRepository) => {
  const onSaved = vi.fn();
  render(
    <StudioDesignProvider>
      <OutfitBuilder
        repository={repository}
        saveAndSelect
        onDirtyChange={vi.fn()}
        onCancel={vi.fn()}
        onSaved={onSaved}
      />
    </StudioDesignProvider>,
  );
  return onSaved;
};

beforeEach(() => {
  uploadReferenceImage.mockReset().mockResolvedValue({ assetId: 'persisted-coat' });
  validateReferenceImage.mockReset().mockResolvedValue({ blockingError: null, warnings: [] });
});
afterEach(cleanup);

describe('OutfitBuilder', () => {
  it('saves and selects a named prompt outfit with enhancement', async () => {
    const user = userEvent.setup();
    const createSavedPrompt = vi.fn(() => saved());
    const repository = { createSavedPrompt } as unknown as CreativeAssetRepository;
    const onSaved = renderBuilder(repository);

    await user.type(
      screen.getByRole('textbox', { name: 'Garment direction' }),
      'A copper field coat.',
    );
    await user.click(screen.getByRole('checkbox', { name: 'Enhance prompt' }));
    await user.click(screen.getByRole('button', { name: 'Continue to save' }));
    await user.type(screen.getByRole('textbox', { name: 'Outfit name' }), 'Copper coat');
    await user.click(screen.getByRole('button', { name: 'Save & Select' }));

    expect(createSavedPrompt).toHaveBeenCalledWith({
      title: 'Copper coat',
      prompt: 'A copper field coat.',
      modelModeId: 'lucy-vton-latest',
      source: 'manual',
      referenceImageAssetId: null,
      vtonInputKind: 'prompt',
      enhancePrompt: true,
    });
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: 'saved-outfit' }));
    expect(uploadReferenceImage).not.toHaveBeenCalled();
  });

  it('uploads only on final save and reuses the completed upload after repository retry', async () => {
    const user = userEvent.setup();
    const createSavedPrompt = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error('Browser storage failed.');
      })
      .mockReturnValue(
        saved({
          prompt: '',
          referenceImageAssetId: 'persisted-coat',
          vtonInputKind: 'saved-outfit',
          enhancePrompt: false,
        }),
      );
    const repository = { createSavedPrompt } as unknown as CreativeAssetRepository;
    renderBuilder(repository);

    await user.click(screen.getByRole('button', { name: 'Reference image' }));
    await user.click(screen.getByRole('button', { name: 'Choose test image' }));
    expect(uploadReferenceImage).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Continue to save' }));
    await user.type(screen.getByRole('textbox', { name: 'Outfit name' }), 'Archive coat');
    await user.click(screen.getByRole('button', { name: 'Save & Select' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Browser storage failed.');
    await user.click(screen.getByRole('button', { name: 'Save & Select' }));

    expect(uploadReferenceImage).toHaveBeenCalledTimes(1);
    expect(createSavedPrompt).toHaveBeenLastCalledWith(
      expect.objectContaining({
        title: 'Archive coat',
        prompt: '',
        referenceImageAssetId: 'persisted-coat',
        vtonInputKind: 'saved-outfit',
        enhancePrompt: false,
      }),
    );
  });
});
