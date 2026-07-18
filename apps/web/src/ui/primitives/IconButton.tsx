import type { ReactNode } from 'react';
import { forwardRef } from 'react';
import { Button, type ButtonProps } from './Button';

export interface IconButtonProps extends Omit<ButtonProps, 'aria-label' | 'children'> {
  label: string;
  children: ReactNode;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, children, size = 'small', ...props },
  ref,
) {
  return (
    <Button
      {...props}
      ref={ref}
      size={size}
      aria-label={label}
      css={{
        flex: '0 0 auto',
        inlineSize: '2.75rem',
        blockSize: '2.75rem',
        minInlineSize: '2.75rem',
        minBlockSize: '2.75rem',
        padding: 0,
      }}
    >
      {children}
    </Button>
  );
});
