// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudioDesignProvider } from '../../ui';
import { ReferenceImageField } from './ReferenceImageField';

afterEach(cleanup);

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
});
