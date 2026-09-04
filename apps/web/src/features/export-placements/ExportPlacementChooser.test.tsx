// @vitest-environment jsdom

import { projectExportSpecificationForAspect } from '@studio/domain';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudioDesignProvider } from '../../ui';
import { ExportPlacementChooser } from './ExportPlacementChooser';

afterEach(cleanup);

const landscape = { width: 1_920, height: 1_080, durationMs: 12_000 } as const;

const chooser = (props: Partial<Parameters<typeof ExportPlacementChooser>[0]> = {}) =>
  render(
    <StudioDesignProvider>
      <ExportPlacementChooser value={null} onChange={vi.fn()} {...props} />
    </StudioDesignProvider>,
  );

describe('ExportPlacementChooser', () => {
  it('asks where the video is going, defaults to keeping the shape, and previews nothing', () => {
    chooser();

    const group = screen.getByRole('group', { name: 'Where is this going?' });
    expect(group).toBeVisible();
    expect(screen.getByRole('button', { name: 'Keep as it is' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // The ratio is secondary detail behind a destination, never the question itself.
    expect(screen.getByText(/keeps the shape it already has/u)).toBeVisible();
    expect(screen.queryByText(/re-framed/u)).not.toBeInTheDocument();
  });

  it('offers every placement in plain terms and reports the chosen specification', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    chooser({ onChange });

    for (const label of [
      'Keep as it is',
      'Phone, full screen',
      'Widescreen',
      'Square post',
      'Tall feed post',
    ]) {
      expect(screen.getByRole('button', { name: label })).toBeVisible();
    }

    await user.click(screen.getByRole('button', { name: 'Phone, full screen' }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith({
      container: 'video/mp4',
      aspect: '9:16',
      resolution: { width: 1_080, height: 1_920 },
      includeAudio: true,
    });

    // Keeping the shape reports the absence of a specification, not a specification that says so.
    await user.click(screen.getByRole('button', { name: 'Keep as it is' }));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('states exactly what the crop discards once the frame is known', () => {
    chooser({ value: projectExportSpecificationForAspect('9:16'), source: landscape });

    expect(
      screen.getByText(
        /re-framed to phone, full screen, 1080×1920\. The middle of the picture is kept, and 68% of the width is trimmed, evenly from the left and right\./u,
      ),
    ).toBeVisible();
  });

  it('says whether the cut’s subtitles survive the shape, exactly once the frame is known', () => {
    const portrait = { width: 1_080, height: 1_920, durationMs: 12_000 } as const;
    chooser({
      value: projectExportSpecificationForAspect('1:1'),
      source: portrait,
      subtitlePlacements: ['bottom'],
    });
    expect(screen.getByText(/Its subtitles stay inside the kept picture\./u)).toBeVisible();
    cleanup();

    chooser({
      value: projectExportSpecificationForAspect('16:9'),
      source: portrait,
      subtitlePlacements: ['top', 'bottom'],
    });
    expect(
      screen.getByText(/Subtitles at the top and bottom would be cut by this shape\./u),
    ).toBeVisible();
    cleanup();

    chooser({ value: projectExportSpecificationForAspect('1:1'), subtitlePlacements: ['bottom'] });
    expect(screen.getByText(/This cut carries subtitles/u)).toBeVisible();
    cleanup();

    chooser({ value: projectExportSpecificationForAspect('1:1'), source: portrait });
    expect(screen.queryByText(/subtitles/iu)).not.toBeInTheDocument();
  });

  it('describes the result without inventing a crop amount when the frame is unmeasured', () => {
    chooser({ value: projectExportSpecificationForAspect('1:1') });

    expect(screen.getByText(/whatever falls outside that shape is trimmed off/u)).toBeVisible();
    expect(screen.queryByText(/% of the width/u)).not.toBeInTheDocument();
  });

  it('degrades to the original shape with the editor’s own explanation', () => {
    chooser({ value: projectExportSpecificationForAspect('4:5'), supported: false });

    expect(screen.getByText('Local editor unavailable')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Keep as it is' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    for (const label of ['Phone, full screen', 'Widescreen', 'Square post', 'Tall feed post']) {
      expect(screen.getByRole('button', { name: label })).toBeDisabled();
    }
  });
});
