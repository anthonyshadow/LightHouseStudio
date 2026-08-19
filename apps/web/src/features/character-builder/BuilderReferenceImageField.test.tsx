// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudioDesignProvider } from '../../ui';
import type { CharacterBuilderUploadedReference } from './machine';
import { BuilderReferenceImageField } from './BuilderReferenceImageField';

const api = vi.hoisted(() => ({ importRemoteReferenceImage: vi.fn() }));
vi.mock('../../adapters/api-client/apiClient', () => api);

const uploadedReference: CharacterBuilderUploadedReference = {
  asset: {
    assetId: '8f45ea24-c274-41a5-a988-aa0602115191',
    mimeType: 'image/png',
    byteSize: 1_572_864,
    source: 'uploaded',
    width: 800,
    height: 1_200,
    createdAt: '2026-07-27T12:00:00.000Z',
    updatedAt: '2026-07-27T12:00:00.000Z',
    contentUrl: '/api/reference-images/8f45ea24-c274-41a5-a988-aa0602115191/content',
  },
  displayName: 'a-very-long-character-reference-name.png',
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('BuilderReferenceImageField presentation', () => {
  it('imports a public HTTPS image through the shared URL flow', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const imported = new File(['remote portrait'], 'remote-portrait.webp', {
      type: 'image/webp',
    });
    api.importRemoteReferenceImage.mockResolvedValue(imported);
    render(
      <StudioDesignProvider>
        <BuilderReferenceImageField
          reference={null}
          pending={false}
          error={null}
          disabled={false}
          onSelect={onSelect}
          onRemove={vi.fn()}
        />
      </StudioDesignProvider>,
    );

    expect(
      screen.queryByRole('textbox', { name: 'Public HTTPS image URL' }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Use an image URL instead' }));
    await user.type(
      screen.getByRole('textbox', { name: 'Public HTTPS image URL' }),
      'https://images.example.test/portrait.webp',
    );
    await user.click(screen.getByRole('button', { name: 'Import image' }));

    await waitFor(() => expect(onSelect).toHaveBeenCalledWith(imported));
    expect(api.importRemoteReferenceImage).toHaveBeenCalledWith(
      'https://images.example.test/portrait.webp',
      expect.any(AbortSignal),
    );
  });

  it('preserves the picker name, accepted types, guidance, and same-file replacement behavior', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <StudioDesignProvider>
        <BuilderReferenceImageField
          reference={null}
          pending={false}
          error={null}
          disabled={false}
          onSelect={onSelect}
          onRemove={vi.fn()}
        />
      </StudioDesignProvider>,
    );

    const input = screen.getByLabelText('Upload imageDrag & drop or choose a file');
    expect(input).toHaveAccessibleName('Upload imageDrag & drop or choose a file');
    expect(input).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp');
    expect(input).toHaveAccessibleDescription(
      'Optional character referenceJPEG, PNG, or WebP up to 10 MiB and 40 megapixels. Choosing a file stores it in your local data directory. Detaching it later removes the link, not the stored file.',
    );
    await user.tab();
    expect(input).toHaveFocus();

    const file = new File(['portrait'], 'portrait.png', { type: 'image/png' });
    await user.upload(input, file);
    await user.upload(input, file);

    expect(onSelect).toHaveBeenNthCalledWith(1, file);
    expect(onSelect).toHaveBeenNthCalledWith(2, file);
  });

  it('keeps nested drag depth active until the outer target leaves and selects the dropped file', () => {
    const onSelect = vi.fn();
    render(
      <StudioDesignProvider>
        <BuilderReferenceImageField
          reference={null}
          pending={false}
          error={null}
          disabled={false}
          onSelect={onSelect}
          onRemove={vi.fn()}
        />
      </StudioDesignProvider>,
    );

    const input = screen.getByLabelText('Upload imageDrag & drop or choose a file');
    const dropTarget = input.parentElement;
    expect(dropTarget).not.toBeNull();
    if (!dropTarget) return;

    fireEvent.dragEnter(dropTarget);
    fireEvent.dragEnter(dropTarget);
    expect(screen.getByText('Drop image here')).toBeInTheDocument();

    fireEvent.dragLeave(dropTarget);
    expect(screen.getByText('Drop image here')).toBeInTheDocument();

    fireEvent.dragLeave(dropTarget);
    expect(screen.getByText('Upload image')).toBeInTheDocument();

    const file = new File(['portrait'], 'dropped.webp', { type: 'image/webp' });
    fireEvent.drop(dropTarget, { dataTransfer: { files: [file] } });
    expect(onSelect).toHaveBeenCalledWith(file);
  });

  it('preserves immutable preview metadata, error semantics, remove naming, and focus recovery', async () => {
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      }),
    );
    const user = userEvent.setup();
    const onRemove = vi.fn();

    const Harness = () => {
      const [reference, setReference] = useState<CharacterBuilderUploadedReference | null>(
        uploadedReference,
      );
      return (
        <BuilderReferenceImageField
          reference={reference}
          pending={false}
          error="The image exceeds the 40-megapixel decoded-image limit."
          disabled={false}
          onSelect={vi.fn()}
          onRemove={() => {
            onRemove();
            setReference(null);
          }}
        />
      );
    };

    render(
      <StudioDesignProvider>
        <Harness />
      </StudioDesignProvider>,
    );

    expect(screen.getByAltText('Current uploaded character reference')).toHaveAttribute(
      'src',
      uploadedReference.asset.contentUrl,
    );
    expect(screen.getByText(uploadedReference.displayName)).toHaveAttribute(
      'title',
      uploadedReference.displayName,
    );
    expect(screen.getByText('1.50 MiB')).toBeInTheDocument();
    expect(screen.getByText(/Detach removes the link, not the stored file/u)).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'The image exceeds the 40-megapixel decoded-image limit.',
    );

    const detach = screen.getByRole('button', { name: 'Detach uploaded character reference' });
    expect(detach).toHaveTextContent('Detach');
    await user.click(detach);

    expect(onRemove).toHaveBeenCalledOnce();
    await waitFor(() =>
      expect(screen.getByLabelText('Upload imageDrag & drop or choose a file')).toHaveFocus(),
    );
  });

  it('keeps upload and removal disabled while pending without replacing the current reference', () => {
    const onSelect = vi.fn();
    render(
      <StudioDesignProvider>
        <BuilderReferenceImageField
          reference={uploadedReference}
          pending
          error={null}
          disabled={false}
          onSelect={onSelect}
          onRemove={vi.fn()}
        />
      </StudioDesignProvider>,
    );

    const input = screen.getByLabelText(
      'Uploading image…Your current reference remains active until this finishes',
    );
    expect(input).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Detach uploaded character reference' }),
    ).toBeDisabled();

    const dropTarget = input.parentElement;
    if (dropTarget) {
      fireEvent.drop(dropTarget, {
        dataTransfer: {
          files: [new File(['replacement'], 'replacement.png', { type: 'image/png' })],
        },
      });
    }
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByText(uploadedReference.displayName)).toBeInTheDocument();
  });
});
