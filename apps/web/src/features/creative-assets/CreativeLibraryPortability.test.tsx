// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { StudioDesignProvider } from '../../ui';
import { CreativeLibraryPortability } from './CreativeLibraryPortability';
import { createCreativeAssetRepository } from './repository';
import { useCreativeAssetSelector } from './useCreativeAssetRepository';
import type { CreativeAssetRepository } from './types';
import type { CreativeLibraryMirror } from './useCreativeLibraryCloudSync';

const savedBlobs: Blob[] = [];
const originalCreateObjectUrl = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
const originalRevokeObjectUrl = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');

/** The library, kept live so a replace is observed the way the real surfaces observe it. */
const Portability = ({
  repository,
  mirror = 'browser-only',
}: {
  repository: CreativeAssetRepository;
  mirror?: CreativeLibraryMirror;
}) => {
  const store = useCreativeAssetSelector(repository, (state) => state.store);
  return <CreativeLibraryPortability repository={repository} store={store} mirror={mirror} />;
};

const renderPortability = (repository: CreativeAssetRepository, mirror?: CreativeLibraryMirror) =>
  render(
    <StudioDesignProvider>
      <Portability repository={repository} {...(mirror ? { mirror } : {})} />
    </StudioDesignProvider>,
  );

const populatedRepository = async () => {
  const repository = createCreativeAssetRepository({ storage: null });
  const character = await repository.createSavedCharacterPrompt({
    name: 'Field host',
    prompt: 'A documentary field host',
    promptIntent: null,
    referenceImageAssetId: 'host-original',
  });
  await repository.createSavedCharacterVariant({
    parentCharacterId: character.id,
    title: 'Evening look',
    referenceImageAssetId: 'host-evening',
    creation: {
      method: 'add-outfit',
      sourceReferenceImageAssetId: 'host-original',
      garmentReferenceImageAssetId: 'garment-one',
    },
  });
  const outfit = await repository.createSavedPrompt({
    title: 'Evening coat',
    prompt: 'A long evening coat',
    modelModeId: 'lucy-vton-latest',
    referenceImageAssetId: 'coat-reference',
  });
  await repository.recordSuccessfulPrompt({
    prompt: outfit.prompt,
    modelModeId: 'lucy-vton-latest',
    savedPromptId: outfit.id,
    referenceImageAssetId: 'coat-reference',
    vtonInputKind: 'saved-outfit',
  });
  return repository;
};

const exportedFile = async (repository: CreativeAssetRepository, filename = 'library.json') => {
  const view = renderPortability(repository);
  await userEvent.click(screen.getByRole('button', { name: 'Export library' }));
  const blob = savedBlobs.at(-1);
  if (!blob) throw new Error('No export was written.');
  const serialized = await blob.text();
  view.unmount();
  return new File([serialized], filename, { type: 'application/json' });
};

const chooseFile = (container: HTMLElement, file: File) => {
  const input = container.querySelector('input[type="file"]');
  expect(input).toBeInstanceOf(HTMLInputElement);
  fireEvent.change(input!, { target: { files: [file] } });
};

describe('CreativeLibraryPortability', () => {
  beforeAll(() => {
    // Installed for the whole file: the revoke runs on a timer that can outlive one test.
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: vi.fn((blob: Blob) => {
        savedBlobs.push(blob);
        return 'blob:creative-library';
      }),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });
  });

  // Re-installed per test: the shared setup restores every spy after each one, and jsdom cannot
  // navigate to the object URL the download anchor points at.
  beforeEach(() => {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  });

  afterAll(() => {
    if (originalCreateObjectUrl) {
      Object.defineProperty(URL, 'createObjectURL', originalCreateObjectUrl);
    } else {
      Reflect.deleteProperty(URL, 'createObjectURL');
    }
    if (originalRevokeObjectUrl) {
      Object.defineProperty(URL, 'revokeObjectURL', originalRevokeObjectUrl);
    } else {
      Reflect.deleteProperty(URL, 'revokeObjectURL');
    }
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
    savedBlobs.length = 0;
  });

  it('exports every record with the reference images it depends on, and restores them into an empty library', async () => {
    const source = await populatedRepository();
    const file = await exportedFile(source, 'creative-library-2026-08-18.json');
    const written = JSON.parse(await file.text()) as {
      referenceImageAssetIds: string[];
      store: Record<string, unknown[]>;
    };

    expect(written.store.savedCharacterPrompts).toHaveLength(1);
    expect(written.store.savedCharacterVariants).toHaveLength(1);
    expect(written.store.savedPrompts).toHaveLength(1);
    expect(written.store.recentPrompts).toHaveLength(1);
    expect(written.referenceImageAssetIds).toEqual([
      'coat-reference',
      'garment-one',
      'host-evening',
      'host-original',
    ]);

    const empty = createCreativeAssetRepository({ storage: null });
    const view = renderPortability(empty);
    chooseFile(view.container, file);

    const dialog = await screen.findByRole('dialog', {
      name: 'Replace your Library?',
    });
    // The confirmation states what arrives and what leaves before anything is replaced.
    expect(
      within(dialog).getByText(
        /1 character, 1 wardrobe variant, 1 saved outfit or prompt and 1 recent prompt/u,
      ),
    ).toBeVisible();
    expect(within(dialog).getByText(/Anything not in the file is lost/u)).toBeVisible();
    expect(within(dialog).getByText(/Reference images are not in the file/u)).toBeVisible();
    expect(empty.getSnapshot().store.savedCharacterPrompts).toHaveLength(0);

    await userEvent.click(within(dialog).getByRole('button', { name: 'Replace library' }));

    await waitFor(() => expect(empty.getSnapshot().store).toEqual(source.getSnapshot().store));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Creative library replaced from the file',
    );
  });

  it('leaves the library untouched when the operator keeps it', async () => {
    const source = await populatedRepository();
    const file = await exportedFile(source);
    const existing = createCreativeAssetRepository({ storage: null });
    await existing.createSavedPrompt({
      title: 'Only local',
      prompt: 'Only local prompt',
      modelModeId: 'lucy-vton-latest',
    });

    const view = renderPortability(existing);
    chooseFile(view.container, file);
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep current Library' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(existing.getSnapshot().store.savedPrompts[0]?.title).toBe('Only local');
  });

  it.each([
    ['{ not json at all', 'That file could not be read.'],
    [JSON.stringify({ kind: 'something-else' }), 'That file is not a creative library export.'],
  ])('refuses a file it cannot import exactly and changes nothing', async (body, message) => {
    const repository = await populatedRepository();
    const before = repository.getSnapshot().store;
    const view = renderPortability(repository);

    chooseFile(view.container, new File([body], 'broken.json', { type: 'application/json' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(message);
    expect(alert).toHaveTextContent('Your library is unchanged.');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(repository.getSnapshot().store).toEqual(before);
  });

  it('refuses an unknown file version and an oversized file before reading it', async () => {
    const source = await populatedRepository();
    const file = await exportedFile(source);
    const written = JSON.parse(await file.text()) as Record<string, unknown>;
    const repository = createCreativeAssetRepository({ storage: null });
    const view = renderPortability(repository);

    chooseFile(
      view.container,
      new File([JSON.stringify({ ...written, fileVersion: 99 })], 'future.json', {
        type: 'application/json',
      }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'written by a different version of this app',
    );

    const oversized = new File(['{}'], 'huge.json', { type: 'application/json' });
    // The bound is checked against the file, so nothing this large is ever read into memory.
    Object.defineProperty(oversized, 'size', { value: 8 * 1024 * 1024 });
    chooseFile(view.container, oversized);
    expect(await screen.findByRole('alert')).toHaveTextContent('too large');
    expect(repository.getSnapshot().store.savedCharacterPrompts).toHaveLength(0);
  });

  it('states account availability without claiming server persistence that may not exist', () => {
    const repository = createCreativeAssetRepository({ storage: null });

    const view = renderPortability(repository, 'browser-only');
    expect(screen.getByText(/account sync is unavailable/iu, { exact: false })).toBeVisible();
    expect(screen.getByText(/never contains the images themselves/u)).toBeVisible();
    view.unmount();

    renderPortability(repository, 'cloud');
    expect(screen.getByText(/available wherever you sign in/u)).toBeVisible();
  });
});
