import type { CSSObject } from '@emotion/react';
import type { PropsWithChildren } from 'react';

export const visuallyHiddenStyles = (): CSSObject => ({
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: 0,
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
});

/**
 * `role` exists for the one case that needs it: a section whose loading state is drawn as a
 * skeleton still owes assistive technology a sentence, and `role="status"` on the hidden text is
 * that sentence without a visible duplicate of what the skeleton already shows.
 */
export const VisuallyHidden = ({ children, role }: PropsWithChildren<{ role?: 'status' }>) => (
  <span css={visuallyHiddenStyles()} role={role}>
    {children}
  </span>
);
