// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { StudioDesignProvider } from '../../ui';
import { MediaStage } from './MediaStage';

afterEach(cleanup);

describe('MediaStage recording status', () => {
  it('exposes elapsed recording time as a queryable timer without live-region chatter', () => {
    render(
      <StudioDesignProvider>
        <MediaStage
          stream={null}
          mode="local"
          lifecycle="ready"
          transformed={false}
          liveSeconds={0}
          generationSeconds={0}
          recording
          recordingSeconds={65}
        />
      </StudioDesignProvider>,
    );

    expect(screen.getByRole('timer', { name: 'Recording elapsed time 1:05' })).toHaveAttribute(
      'aria-live',
      'off',
    );
    expect(screen.getByRole('status')).toHaveTextContent('Local preview');
  });
});
