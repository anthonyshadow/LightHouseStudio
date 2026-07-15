import { useTheme, type CSSObject, type Theme } from '@emotion/react';
import { StatusNotice } from '../../ui';
import type { PromptValidation } from './model';

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

export const PromptFeedback = ({ validation }: PromptFeedbackProps) => {
  const theme = useTheme();
  if (validation.blocking.length === 0 && validation.warnings.length === 0) return null;

  return (
    <div css={feedbackRootStyles(theme)} aria-live="polite">
      {validation.blocking.length > 0 ? (
        <StatusNotice tone="danger" title="Needs attention">
          <ul css={issueListStyles(theme)}>
            {validation.blocking.map((issue) => (
              <li key={`${issue.code}-${issue.field ?? 'general'}`}>{issue.message}</li>
            ))}
          </ul>
        </StatusNotice>
      ) : null}
      {validation.warnings.length > 0 ? (
        <StatusNotice tone="warning" title="Creative guidance">
          <ul css={issueListStyles(theme)}>
            {validation.warnings.map((issue) => (
              <li key={`${issue.code}-${issue.field ?? 'general'}`}>{issue.message}</li>
            ))}
          </ul>
        </StatusNotice>
      ) : null}
    </div>
  );
};
