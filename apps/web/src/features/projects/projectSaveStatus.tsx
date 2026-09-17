import { useTheme } from '@emotion/react';
import { Button, StatusNotice } from '../../ui';
import { dialogActionsStyles } from './ProjectRouteSurface.styles';
import type { ProjectSessionPort } from './useProjectSession';

/**
 * Only what these two read. A narrower port than `ProjectSessionPort` on purpose: the workspace
 * hands them a session it has already narrowed, and widening that caller to satisfy a helper would
 * be the tail wagging the dog.
 */
export type ProjectSaveStatusSession = Pick<
  ProjectSessionPort,
  'phase' | 'current' | 'hasLocalProposal' | 'message' | 'retry' | 'discard'
>;

/**
 * What a Project's autosave is doing, and the choice it offers when it cannot.
 *
 * Both lived inside the workspace masthead until the arrangement editor needed them. That masthead
 * is hidden outright while an editor holds the stage, so on the one surface that produces
 * arrangement changes there was no save state at all and no way to resolve a conflict in place.
 * They take the session *port* rather than the hook's return, which is what lets any surface
 * holding a session render them.
 */
export const projectWorkspaceSaveStatus = (
  session: ProjectSaveStatusSession,
  sourceBusy: boolean,
  updatedAt: string,
): {
  readonly label: string;
  readonly tone: 'neutral' | 'warning' | 'danger';
  readonly dateTime?: string;
} => {
  if (sourceBusy || session.phase === 'saving') {
    return { label: 'Autosaving…', tone: 'neutral' };
  }
  if (session.phase === 'dirty') return { label: 'Unsaved changes', tone: 'neutral' };
  if (session.phase === 'hydrating') return { label: 'Checking save…', tone: 'neutral' };
  if (session.phase === 'conflict') return { label: 'Conflict', tone: 'warning' };
  if (session.phase === 'error') return { label: 'Not autosaved', tone: 'danger' };
  const time = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(
    new Date(updatedAt),
  );
  return { label: `Autosaved · ${time}`, tone: 'neutral', dateTime: updatedAt };
};

export const ProjectSessionNotice = ({
  session,
  sourceBusy,
}: {
  readonly session: ProjectSaveStatusSession;
  readonly sourceBusy: boolean;
}) => {
  const theme = useTheme();
  if (sourceBusy || session.current === null) return null;
  const actions = session.hasLocalProposal ? (
    <div css={dialogActionsStyles(theme)}>
      <Button onClick={() => void session.retry()}>Reapply changes</Button>
      <Button variant="danger" onClick={session.discard}>
        Discard local changes
      </Button>
    </div>
  ) : null;

  switch (session.phase) {
    case 'hydrating':
      return null;
    case 'dirty':
    case 'saving':
      return null;
    case 'conflict':
      return (
        <StatusNotice role="alert" tone="warning" title="Conflict">
          <p>
            {session.message ??
              'This Project changed somewhere else. Your unsaved changes are still here.'}
          </p>
          {actions}
        </StatusNotice>
      );
    case 'error':
      return (
        <StatusNotice role="alert" tone="danger" title="Changes not saved">
          <p>
            {session.message ??
              'Lightframe could not be reached. Your unsaved changes are still here.'}
          </p>
          {actions}
        </StatusNotice>
      );
    case 'saved':
      return null;
  }
};
