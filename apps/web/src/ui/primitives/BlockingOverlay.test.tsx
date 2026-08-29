// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { StudioDesignProvider } from '../StudioDesignProvider';
import { studioTheme } from '../theme';
import { BlockingOverlay, blockingOverlayStyles } from './BlockingOverlay';

afterEach(cleanup);

describe('BlockingOverlay', () => {
  it('announces the work rather than only drawing it', () => {
    render(<BlockingOverlay title="Processing video…" detail="Playback is paused." />, {
      wrapper: StudioDesignProvider,
    });

    const overlay = screen.getByRole('status');
    expect(overlay).toHaveAttribute('aria-live', 'polite');
    expect(overlay).toHaveTextContent('Processing video…');
    expect(overlay).toHaveTextContent('Playback is paused.');
  });

  it('swallows input by default, and lets it through only when asked', () => {
    expect(blockingOverlayStyles(studioTheme, 'soft').pointerEvents).toBe('auto');

    const { container } = render(
      <StudioDesignProvider>
        <BlockingOverlay passthrough title="Connecting to AI…" detail="Preparing." />
      </StudioDesignProvider>,
    );
    expect(getComputedStyle(container.querySelector('[role="status"]')!).pointerEvents).toBe(
      'none',
    );
  });

  it('fills its nearest positioned ancestor rather than choosing where it sits', () => {
    const styles = blockingOverlayStyles(studioTheme, 'soft');

    expect(styles.position).toBe('absolute');
    expect(styles.inset).toBe(0);
    // Placement and stacking belong to the host: the workspace overlay puts itself in a grid cell
    // and raises its own layer, and the stage relies on the stacking context it already owns.
    expect(styles.zIndex).toBe(studioTheme.layers.stageBlocking);
  });

  it('keeps the workspace layer clear of a surface’s own stacking, and under its dialogs', () => {
    const { workspaceBlocking, stageNotices, overlay } = studioTheme.layers;

    expect(workspaceBlocking).toBeGreaterThan(stageNotices);
    // A confirmation or an exit guard must still reach the operator over a blocked surface.
    expect(workspaceBlocking).toBeLessThan(overlay);
  });
});
