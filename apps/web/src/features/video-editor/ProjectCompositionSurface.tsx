import type { ProjectCurrentResponse } from '@studio/contracts';
import { useProjectClipMediaCatalogue } from '../projects/useProjectMediaController';
import type { ProjectSessionPort } from '../projects/useProjectSession';
import { CompositionSurface } from './CompositionSurface';

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
}: {
  readonly current: ProjectCurrentResponse;
  readonly session: ProjectSessionPort;
  readonly archived: boolean;
  readonly onClose: () => void;
}) => {
  const media = useProjectClipMediaCatalogue(current);
  return (
    <CompositionSurface
      current={current}
      session={session}
      media={media}
      archived={archived}
      onClose={onClose}
    />
  );
};
