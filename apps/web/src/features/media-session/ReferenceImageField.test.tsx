// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudioDesignProvider } from '../../ui';
import { ReferenceImageField } from './ReferenceImageField';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ReferenceImageField focus recovery', () => {
  it('preserves its exact mode-specific picker names, accepted types, guidance, and tab focus', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <StudioDesignProvider>
        <ReferenceImageField mode="lucy-2.5" referenceImage={null} onChange={vi.fn()} />
      </StudioDesignProvider>,
    );

    const portraitInput = screen.getByLabelText('Optional portrait reference');
    expect(portraitInput).toHaveAccessibleName(
      'Optional portrait reference Upload imageDrag & drop or choose a file',
    );
    expect(portraitInput).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp');
    expect(portraitInput).toHaveAccessibleDescription(
      'Optional portrait referenceJPEG, PNG, or WebP up to 10 MiB. Use a clear, well-lit portrait for the most consistent character.',
    );
    await user.tab();
    expect(portraitInput).toHaveFocus();

    rerender(
      <StudioDesignProvider>
        <ReferenceImageField mode="lucy-vton-3" referenceImage={null} onChange={vi.fn()} />
      </StudioDesignProvider>,
    );

    const garmentInput = screen.getByLabelText('Garment reference image');
    expect(garmentInput).toHaveAccessibleName(
      'Garment reference image Upload imageDrag & drop or choose a file',
    );
    expect(garmentInput).toHaveAccessibleDescription(
      'Garment reference imageJPEG, PNG, or WebP up to 10 MiB. Use one clearly visible, centered garment on a simple background.',
    );
  });

  it('returns focus to the file input after its Clear image button unmounts', async () => {
    const user = userEvent.setup();
    const image = new File(['portrait'], 'portrait.webp', { type: 'image/webp' });
    const onChange = vi.fn();
    render(
      <StudioDesignProvider>
        <ReferenceImageField
          mode="lucy-2.5"
          referenceImage={{ kind: 'ephemeral', file: image, previewUrl: 'blob:portrait' }}
          onChange={onChange}
        />
      </StudioDesignProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Clear image' }));

    expect(onChange).toHaveBeenCalledWith(null);
    await waitFor(() => expect(screen.getByLabelText('Optional portrait reference')).toHaveFocus());
  });

  it('shows contained file metadata and the existing temporary-memory warning', () => {
    const image = new File(['x'.repeat(1_572_864)], 'a-very-long-garment-reference-name.webp', {
      type: 'image/webp',
    });

    render(
      <StudioDesignProvider>
        <ReferenceImageField
          mode="lucy-vton-3"
          referenceImage={{ kind: 'ephemeral', file: image, previewUrl: 'blob:garment' }}
          onChange={vi.fn()}
        />
      </StudioDesignProvider>,
    );

    expect(screen.getByText(image.name)).toHaveAttribute('title', image.name);
    expect(screen.getByText('1.50 MiB')).toBeInTheDocument();
    expect(screen.getByText(/stays in memory and is never saved/u)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear image' })).toHaveTextContent('Remove');
  });

  it('validates and accepts a dropped reference without uploading it', async () => {
    const NativeURL = URL;
    class StubURL extends NativeURL {
      static override createObjectURL = vi.fn().mockReturnValue('blob:dropped-garment');
    }
    vi.stubGlobal('URL', StubURL);
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockResolvedValue({ width: 900, height: 1_100, close: vi.fn() }),
    );
    const image = new File(['garment'], 'linen-overshirt.webp', { type: 'image/webp' });
    const onChange = vi.fn();

    render(
      <StudioDesignProvider>
        <ReferenceImageField mode="lucy-vton-3" referenceImage={null} onChange={onChange} />
      </StudioDesignProvider>,
    );

    const pickerText = screen.getByText('Drag & drop or choose a file');
    const dropTarget = pickerText.parentElement?.parentElement;
    expect(dropTarget).toBeTruthy();
    fireEvent.drop(dropTarget as HTMLElement, { dataTransfer: { files: [image] } });

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith({
        kind: 'ephemeral',
        file: image,
        previewUrl: 'blob:dropped-garment',
      }),
    );
  });

  it('keeps nested drag depth active, exposes validation guidance, and blocks invalid drops', async () => {
    const onChange = vi.fn();
    render(
      <StudioDesignProvider>
        <ReferenceImageField mode="lucy-vton-3" referenceImage={null} onChange={onChange} />
      </StudioDesignProvider>,
    );

    const input = screen.getByLabelText('Garment reference image');
    const dropTarget = input.parentElement;
    expect(dropTarget).not.toBeNull();
    if (!dropTarget) return;

    fireEvent.dragEnter(dropTarget);
    fireEvent.dragEnter(dropTarget);
    expect(screen.getByText('Drop image here')).toBeInTheDocument();
    expect(screen.getByText('Release to validate the file')).toBeInTheDocument();

    fireEvent.dragLeave(dropTarget);
    expect(screen.getByText('Drop image here')).toBeInTheDocument();
    fireEvent.dragLeave(dropTarget);
    expect(screen.getByText('Upload image')).toBeInTheDocument();

    const invalid = new File(['gif'], 'garment.gif', { type: 'image/gif' });
    fireEvent.drop(dropTarget, { dataTransfer: { files: [invalid] } });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Choose a JPEG, PNG, or WebP image.',
    );
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription(/Choose a JPEG, PNG, or WebP image/u);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('disables replacement and removal while the enclosing session is recording', () => {
    const image = new File(['portrait'], 'portrait.webp', { type: 'image/webp' });
    render(
      <StudioDesignProvider>
        <ReferenceImageField
          mode="lucy-2.5"
          referenceImage={{ kind: 'ephemeral', file: image, previewUrl: 'blob:portrait' }}
          disabled
          onChange={vi.fn()}
        />
      </StudioDesignProvider>,
    );

    expect(screen.getByLabelText('Optional portrait reference')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Clear image' })).toBeDisabled();
  });
});
