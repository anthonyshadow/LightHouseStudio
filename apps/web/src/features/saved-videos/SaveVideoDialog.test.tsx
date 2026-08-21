// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StudioDesignProvider } from '../../ui';
import { SaveVideoDialog } from './SaveVideoDialog';

// jsdom has no WebGL, so the render capability is stated explicitly rather than inferred.
const renderCapable = vi.fn(() => true);
vi.mock('../video-editor/videoEditShader', () => ({
  videoEditPreviewSupported: () => renderCapable(),
}));
vi.mock('../video-editor/renderVideoEdit', () => ({
  renderVideoEdit: vi.fn(),
  videoEditRenderingSupported: () => renderCapable(),
}));

beforeEach(() => renderCapable.mockReturnValue(true));

afterEach(cleanup);

const renderDialog = (props: Partial<Parameters<typeof SaveVideoDialog>[0]> = {}) => {
  const onCancel = vi.fn();
  const onSave = vi.fn();
  render(
    <StudioDesignProvider>
      <SaveVideoDialog
        fallbackName="Recorded take · 20260808T140000Z · ab12cd34"
        onCancel={onCancel}
        onSave={onSave}
        {...props}
      />
    </StudioDesignProvider>,
  );
  return { onCancel, onSave };
};

describe('SaveVideoDialog', () => {
  it('accepts a custom name and trims it before saving', async () => {
    const user = userEvent.setup();
    const { onSave } = renderDialog();
    const name = screen.getByRole('textbox', { name: 'Video name (optional)' });

    expect(name).toHaveFocus();
    await user.type(name, '  Studio intro  ');
    await user.click(screen.getByRole('button', { name: 'Save to Assets' }));

    expect(onSave).toHaveBeenCalledWith('Studio intro', { kind: 'auto' }, null);
  });

  it('uses the existing generated-name fallback when the optional field is blank', async () => {
    const user = userEvent.setup();
    const { onSave } = renderDialog();

    expect(screen.getByText(/Leave blank to use.*Recorded take/u)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Save to Assets' }));

    expect(onSave).toHaveBeenCalledWith(undefined, { kind: 'auto' }, null);
  });

  it('reports the chosen poster source and falls back to automatic when no image is attached', async () => {
    const user = userEvent.setup();
    const { onSave } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'First frame' }));
    await user.click(screen.getByRole('button', { name: 'Save to Assets' }));
    expect(onSave).toHaveBeenLastCalledWith(undefined, { kind: 'first-frame' }, null);

    await user.click(screen.getByRole('button', { name: 'Upload image' }));
    expect(screen.getByLabelText('Preview image (optional)')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save to Assets' }));
    expect(onSave).toHaveBeenLastCalledWith(undefined, { kind: 'auto' }, null);
  });

  it('uses an attached image as the poster source', async () => {
    const user = userEvent.setup();
    const { onSave } = renderDialog();
    const image = new File(['poster'], 'poster.png', { type: 'image/png' });

    await user.click(screen.getByRole('button', { name: 'Upload image' }));
    await user.upload(screen.getByLabelText('Preview image (optional)'), image);
    await user.click(screen.getByRole('button', { name: 'Save to Assets' }));

    expect(onSave).toHaveBeenCalledWith(undefined, { kind: 'image', file: image }, null);
  });

  it('rejects an oversized image without changing the poster source', async () => {
    const user = userEvent.setup();
    const { onSave } = renderDialog();
    const bad = new File(['poster'], 'poster.png', { type: 'image/png' });
    Object.defineProperty(bad, 'size', { value: 11 * 1024 * 1024 });

    await user.click(screen.getByRole('button', { name: 'Upload image' }));
    await user.upload(screen.getByLabelText('Preview image (optional)'), bad);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Choose an image that is 10 MiB or smaller.',
    );
    await user.click(screen.getByRole('button', { name: 'Save to Assets' }));
    expect(onSave).toHaveBeenCalledWith(undefined, { kind: 'auto' }, null);
  });

  it('offers no placement until the frame it would re-frame has been measured', () => {
    renderDialog();

    expect(screen.queryByRole('group', { name: 'Where is this going?' })).not.toBeInTheDocument();
  });

  it('reports the chosen placement alongside the name and poster', async () => {
    const user = userEvent.setup();
    const { onSave } = renderDialog({
      source: { width: 1_920, height: 1_080, durationMs: 12_000 },
    });

    await user.click(screen.getByRole('button', { name: 'Square post' }));
    expect(screen.getByText(/44% of the width is trimmed/u)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Save to Assets' }));

    expect(onSave).toHaveBeenCalledWith(
      undefined,
      { kind: 'auto' },
      {
        container: 'video/mp4',
        aspect: '1:1',
        resolution: { width: 1_080, height: 1_080 },
        includeAudio: true,
      },
    );
  });

  it('holds the dialog open and answerable while a placement renders', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const cancelRender = vi.fn();
    render(
      <StudioDesignProvider>
        <SaveVideoDialog
          fallbackName="Recorded take"
          source={{ width: 1_920, height: 1_080, durationMs: 12_000 }}
          placementRender={{
            phase: 'rendering',
            progress: 0.42,
            error: null,
            onCancel: cancelRender,
          }}
          onCancel={onCancel}
          onSave={vi.fn()}
        />
      </StudioDesignProvider>,
    );

    const progress = screen.getByRole('status');
    expect(progress).toHaveTextContent('42%');
    await user.click(screen.getByRole('button', { name: 'Cancel re-framing' }));
    expect(cancelRender).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });

  it('saves in the original shape when the browser cannot re-frame', async () => {
    const user = userEvent.setup();
    renderCapable.mockReturnValue(false);
    const { onSave } = renderDialog({
      source: { width: 1_920, height: 1_080, durationMs: 12_000 },
    });

    expect(screen.getByText('Local editor unavailable')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Square post' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Save to Assets' }));

    expect(onSave).toHaveBeenCalledWith(undefined, { kind: 'auto' }, null);
  });

  it('cancels without saving', async () => {
    const user = userEvent.setup();
    const { onCancel, onSave } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalledOnce();
    expect(onSave).not.toHaveBeenCalled();
  });
});
