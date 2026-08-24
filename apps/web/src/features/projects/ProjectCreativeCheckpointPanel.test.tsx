// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudioDesignProvider } from '../../ui';
import { ProjectCreativeCheckpointPanel } from './ProjectCreativeCheckpointPanel';
import type { useProjectCreativeSessionAdapter } from './useProjectCreativeSessionAdapter';
import type { useProjectWorkingMediaController } from './useProjectWorkingMediaController';

type CreativeController = ReturnType<typeof useProjectCreativeSessionAdapter>;
type WorkingMediaController = ReturnType<typeof useProjectWorkingMediaController>;

const creativeController = (overrides: Partial<CreativeController> = {}): CreativeController => ({
  phase: 'idle',
  message: null,
  resourceIssues: [],
  checkpoint: vi.fn(() => Promise.resolve(true)),
  ...overrides,
});

const workingMediaController = (
  overrides: Partial<WorkingMediaController> = {},
): WorkingMediaController => ({
  phase: 'idle',
  message: null,
  busy: false,
  adoptRenderPreview: vi.fn(() => Promise.resolve(true)),
  cancel: vi.fn(),
  ...overrides,
});

const renderPanel = (controller: CreativeController, workingMedia: WorkingMediaController) => {
  const onChooseAnother = vi.fn();
  const view = render(
    <ProjectCreativeCheckpointPanel
      controller={controller}
      workingMedia={workingMedia}
      onChooseAnother={onChooseAnother}
    />,
    { wrapper: StudioDesignProvider },
  );
  return { ...view, onChooseAnother };
};

afterEach(cleanup);

describe('ProjectCreativeCheckpointPanel', () => {
  it('identifies an unavailable historical resource and routes replacement by exact kind', async () => {
    const checkpoint = vi.fn(() => Promise.resolve(true));
    const controller = creativeController({
      checkpoint,
      resourceIssues: [
        {
          kind: 'outfit',
          historicalLabel: 'Retired wardrobe',
          reason: 'missing',
          message:
            'Retired wardrobe is unavailable. Its historical applied settings remain visible.',
        },
      ],
    });
    const workingMedia = workingMediaController({
      phase: 'conflict',
      message: 'A newer Project revision remains current.',
    });
    const { onChooseAnother } = renderPanel(controller, workingMedia);
    const user = userEvent.setup();

    expect(screen.getByRole('complementary', { name: 'Project creative setup' })).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('Retired wardrobe');
    expect(screen.getByRole('alert')).toHaveTextContent('A newer Project revision');

    await user.click(screen.getByRole('button', { name: 'Choose another' }));
    expect(onChooseAnother).toHaveBeenCalledWith('outfit');
    await user.click(screen.getByRole('button', { name: 'Keep this setup' }));
    expect(checkpoint).toHaveBeenCalledOnce();
  });

  it('offers a replacement for reference errors and distinguishes saving and saved media', async () => {
    const controller = creativeController({
      phase: 'error',
      message: 'The exact reusable reference is unavailable; choose another reference.',
    });
    const workingMedia = workingMediaController({
      phase: 'saving',
      message: 'Validating the retained bytes.',
    });
    const { onChooseAnother, rerender } = renderPanel(controller, workingMedia);
    const user = userEvent.setup();

    expect(screen.getByRole('alert')).toHaveTextContent('exact reusable reference');
    expect(screen.getByRole('status')).toHaveTextContent('Saving current cut');
    await user.click(screen.getByRole('button', { name: 'Choose another' }));
    expect(onChooseAnother).toHaveBeenCalledWith('reference');

    rerender(
      <ProjectCreativeCheckpointPanel
        controller={creativeController({ phase: 'saving', message: 'Saving exact setup.' })}
        workingMedia={workingMediaController({
          phase: 'saved',
          message: 'Durable media is ready.',
        })}
        onChooseAnother={onChooseAnother}
      />,
    );

    expect(screen.getByRole('button', { name: 'Keeping setup…' })).toBeDisabled();
    expect(screen.getByText('Current cut ready')).toBeVisible();
  });

  it('announces a failed working-media adoption without offering an unrelated replacement', () => {
    renderPanel(
      creativeController({ phase: 'saved', message: 'Creative setup saved.' }),
      workingMediaController({
        phase: 'error',
        message: 'That version could not be used safely.',
      }),
    );

    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByRole('alert')).toHaveTextContent('Current cut not changed');
    expect(screen.queryByRole('button', { name: 'Choose another' })).not.toBeInTheDocument();
  });
});
