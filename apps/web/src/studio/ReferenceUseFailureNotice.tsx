import { useTheme } from '@emotion/react';
import { Button, StatusNotice } from '../ui';

export interface ReferenceUseFailure {
  readonly message: string;
  readonly onRetry: () => void;
  readonly onContinueWithoutReference?: (() => void) | undefined;
}

/**
 * Reports a reference image that could not be restored for the selection being applied.
 *
 * Its own component, and a sibling of the tool rail rather than part of it: the failure belongs to
 * reference hydration, not to any tool. Its previous home was inside the retired Prompt Workshop
 * overlay, which meant it was only ever visible to an operator who happened to have that panel
 * open — and every path that can produce it starts somewhere else.
 */
export const ReferenceUseFailureNotice = ({
  failure,
}: {
  readonly failure: ReferenceUseFailure | null;
}) => {
  const theme = useTheme();
  if (!failure) return null;

  return (
    <StatusNotice tone="danger" title="Reference image could not be restored" role="alert">
      {failure.message}
      <div
        css={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: theme.space.xs,
          marginBlockStart: theme.space.xs,
        }}
      >
        <Button size="small" variant="secondary" onClick={failure.onRetry}>
          Retry
        </Button>
        {failure.onContinueWithoutReference ? (
          <Button size="small" variant="quiet" onClick={failure.onContinueWithoutReference}>
            Continue without reference
          </Button>
        ) : null}
      </div>
    </StatusNotice>
  );
};
