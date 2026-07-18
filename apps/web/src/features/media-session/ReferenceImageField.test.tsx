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
  it('returns focus to the file input after its Clear image button unmounts', async () => {
    const user = userEvent.setup();
    const image = new File(['portrait'], 'portrait.webp', { type: 'image/webp' });
    const onChange = vi.fn();
    render(
      <StudioDesignProvider>
        <ReferenceImageField
          mode="lucy-2.5"
          image={image}
          previewUrl="blob:portrait"
          onChange={onChange}
        />
      </StudioDesignProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Clear image' }));

    expect(onChange).toHaveBeenCalledWith(null, null);
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
          image={image}
          previewUrl="blob:garment"
          onChange={vi.fn()}
        />
      </StudioDesignProvider>,
    );

    expect(screen.getByText(image.name)).toHaveAttribute('title', image.name);
    expect(screen.getByText('1.5 MiB')).toBeInTheDocument();
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
        <ReferenceImageField
          mode="lucy-vton-3"
          image={null}
          previewUrl={null}
          onChange={onChange}
        />
      </StudioDesignProvider>,
    );

    const pickerText = screen.getByText('Drag & drop or choose a file');
    const dropTarget = pickerText.parentElement?.parentElement;
    expect(dropTarget).toBeTruthy();
    fireEvent.drop(dropTarget as HTMLElement, { dataTransfer: { files: [image] } });

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(image, 'blob:dropped-garment'));
  });

  it('disables replacement and removal while the enclosing session is recording', () => {
    const image = new File(['portrait'], 'portrait.webp', { type: 'image/webp' });
    render(
      <StudioDesignProvider>
        <ReferenceImageField
          mode="lucy-2.5"
          image={image}
          previewUrl="blob:portrait"
          disabled
          onChange={vi.fn()}
        />
      </StudioDesignProvider>,
    );

    expect(screen.getByLabelText('Optional portrait reference')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Clear image' })).toBeDisabled();
  });
});
