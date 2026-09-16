import type { ProjectCurrentResponse } from '@studio/contracts';
import { useCallback } from 'react';
import { useProjectClipMediaCatalogue } from '../projects/useProjectMediaController';
import type { ProjectSessionPort } from '../projects/useProjectSession';
import { CompositionSurface } from './CompositionSurface';

/** Whether this Project's arrangement is rendering, for the guard that must not abandon a worker. */
export interface CompositionRenderActivity {
  readonly projectId: string;
  readonly busy: boolean;
}

/**
 * The arrangement editor with a Project's media resolved for it.
 *
 * A seam rather than a layer: {@link CompositionSurface} is given its clips' media so it can be
 * rendered from a fixture, and this is the one place that goes and gets it. It also keeps the
 * catalogue hook unconditional — the workspace only mounts this while the operator is arranging,
 * which is exactly the condition a hook may not be called under.
 */
export const ProjectCompositionSurface = ({
  current,
  session,
  archived,
  onClose,
  onRenderActivityChange,
}: {
  readonly current: ProjectCurrentResponse;
  readonly session: ProjectSessionPort;
  readonly archived: boolean;
  readonly onClose: () => void;
  /** Reported up so route exit, `beforeunload` and logout treat the render like the editor's. */
  readonly onRenderActivityChange?: ((activity: CompositionRenderActivity) => void) | undefined;
}) => {
  const media = useProjectClipMediaCatalogue(current);
  const projectId = current.project.id;
  const onRenderingChange = useCallback(
    (busy: boolean) => onRenderActivityChange?.({ projectId, busy }),
    [onRenderActivityChange, projectId],
  );
  return (
    <CompositionSurface
      current={current}
      session={session}
      media={media}
      archived={archived}
      onClose={onClose}
      onRenderingChange={onRenderingChange}
    />
  );
};
