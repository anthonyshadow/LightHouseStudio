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
 * `role` exists for the cases that need a live region without a second visible copy of what the
 * surface already draws: `status` for a section whose loading state is a skeleton, `alert` for a
 * failure whose visible form is a colour and a glyph — a control's `aria-label` names it, but
 * naming is not announcing, so nothing reaches a screen reader without this.
 */
export const VisuallyHidden = ({
  children,
  role,
}: PropsWithChildren<{ role?: 'status' | 'alert' }>) => (
  <span css={visuallyHiddenStyles()} role={role}>
    {children}
  </span>
);
