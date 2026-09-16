import type { CSSObject } from '@emotion/react';
import type { ComponentPropsWithoutRef } from 'react';

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
 * Text for a screen reader and for nothing else.
 *
 * Its main use is a live region without a second visible copy of what the surface already draws:
 * `status` for a section whose loading state is a skeleton, `alert` for a failure whose visible
 * form is a colour and a glyph — a control's `aria-label` names it, but naming is not announcing,
 * so nothing reaches a screen reader without this.
 *
 * Every `span` attribute is forwarded. It used to take `role` alone and drop the rest, which made
 * `aria-live` on it a silent no-op that neither the type checker nor a test could catch, and left
 * callers nesting a second `span` inside this one to get a region at all.
 */
export const VisuallyHidden = ({ children, ...spanProps }: ComponentPropsWithoutRef<'span'>) => (
  <span {...spanProps} css={visuallyHiddenStyles()}>
    {children}
  </span>
);
