import type { PropsWithChildren, ReactNode } from 'react';
import { Surface } from '@web/ui';

export const StoryColumn = ({
  children,
  width = '54rem',
}: PropsWithChildren<{ width?: string }>) => (
  <div
    css={(theme) => ({
      width: `min(100%, ${width})`,
      margin: '0 auto',
      display: 'grid',
      gap: theme.space.lg,
    })}
  >
    {children}
  </div>
);

export const StoryGrid = ({ children }: PropsWithChildren) => (
  <div
    css={(theme) => ({
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 18rem), 1fr))',
      gap: theme.space.md,
    })}
  >
    {children}
  </div>
);

export const StorySection = ({
  title,
  description,
  children,
}: PropsWithChildren<{ title: string; description?: ReactNode }>) => (
  <Surface as="section">
    <h2 css={(theme) => ({ margin: 0, fontFamily: theme.type.display })}>{title}</h2>
    {description ? (
      <p css={(theme) => ({ color: theme.colors.textMuted, lineHeight: 1.6 })}>{description}</p>
    ) : null}
    <div css={(theme) => ({ display: 'grid', gap: theme.space.md })}>{children}</div>
  </Surface>
);
