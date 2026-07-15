import type { CSSObject } from '@emotion/react';
import type { PropsWithChildren } from 'react';

const visuallyHiddenStyles = (): CSSObject => ({
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

export const VisuallyHidden = ({ children }: PropsWithChildren) => (
  <span css={visuallyHiddenStyles()}>{children}</span>
);
