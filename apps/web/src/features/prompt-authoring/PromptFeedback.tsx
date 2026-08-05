import { useTheme, type CSSObject, type Theme } from '@emotion/react';
import { StatusNotice } from '../../ui';
import type { PromptIssue, PromptValidation } from './model';

interface PromptFeedbackProps {
  validation: PromptValidation;
}

const feedbackRootStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gap: theme.space.xs,
});

const issueListStyles = (theme: Theme): CSSObject => ({
  margin: 0,
  paddingInlineStart: theme.space.lg,
  display: 'grid',
  gap: theme.space.xxs,
});

const renderIssueList = (issues: readonly PromptIssue[], theme: Theme) => (
  <ul css={issueListStyles(theme)}>
    {issues.map((issue) => (
      <li key={`${issue.code}-${issue.field ?? 'general'}`}>{issue.message}</li>
    ))}
  </ul>
);

export const PromptFeedback = ({ validation }: PromptFeedbackProps) => {
  const theme = useTheme();
  if (validation.blocking.length === 0 && validation.warnings.length === 0) return null;

  return (
    <div css={feedbackRootStyles(theme)} aria-live="polite">
      {validation.blocking.length > 0 ? (
        <StatusNotice tone="danger" title="Needs attention">
          {renderIssueList(validation.blocking, theme)}
        </StatusNotice>
      ) : null}
      {validation.warnings.length > 0 ? (
        <StatusNotice tone="warning" title="Creative guidance">
          {renderIssueList(validation.warnings, theme)}
        </StatusNotice>
      ) : null}
    </div>
  );
};
