import type { CSSObject, Theme } from '@emotion/react';
import type { ChangeEvent } from 'react';
import type { PromptIssue } from './model';

export const promptFieldGridStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: theme.space.md,
  '@media (max-width: 42rem)': {
    gridTemplateColumns: 'minmax(0, 1fr)',
  },
});

export const promptFullWidthStyles = (): CSSObject => ({
  gridColumn: '1 / -1',
});

export const promptIssueFor = (issues: readonly PromptIssue[], field: string) =>
  issues.find((issue) => issue.field === field)?.message;

export const promptValueFrom = (
  event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
) => event.currentTarget.value;
