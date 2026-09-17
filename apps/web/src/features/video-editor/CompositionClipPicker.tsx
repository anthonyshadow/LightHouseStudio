import { useTheme, type CSSObject, type Theme } from '@emotion/react';
import { projectMediaReferenceKey, type Composition } from '@studio/domain';
import { useMemo, type ReactNode, type RefObject } from 'react';
import { Button, OverlayPanel, StatusNotice } from '../../ui';
import type {
  ProjectClipMediaCatalogue,
  ProjectClipMediaEntry,
} from '../projects/projectClipMedia';
import { videoRowCopyStyles, videoRowListStyles } from '../projects/projectVideoRow.styles';
import type { ProjectClipMediaCatalogueStatus } from '../projects/useProjectMediaController';
import { formatVideoEditTimelineTime } from './types';

const rowStyles = (theme: Theme): CSSObject => ({
  ...videoRowCopyStyles(theme),
  // The button primitive centres its content; a row reads from its start edge, filling the width.
  gridTemplateColumns: 'minmax(0, 1fr)',
  justifyContent: 'start',
  justifyItems: 'start',
  width: '100%',
  padding: theme.space.xs,
  textAlign: 'start',
});

const heldLabel = (count: number): string =>
  count === 1
    ? 'Already in this arrangement as 1 clip.'
    : `Already in this arrangement as ${count} clips.`;

/**
 * The Project's media, offered to the arrangement one video at a time.
 *
 * A panel over the surface rather than a list inside it, for the same reason the Media area's
 * saved-video picker is one: the arrangement editor already fills the stage, and a list that can
 * run to the Project's source limit has nowhere to sit there without pushing the preview and the
 * inspector off the screen. The panel's own focus trap, Escape and return-to-opener come with it.
 *
 * Every row is the whole of one video — its frame, its length, whether it carries sound, and how
 * many clips already stand over it — because that is everything the render's policy will read
 * from it, and the operator choosing a second video deserves to see the shape it will bring. The
 * row is named by that content, as the saved-video picker's rows are; the panel's title carries
 * the verb. The length is written the way the strip will write the clip (`00:12.00`), not the
 * way the Media area lists the file, because it is the clip's length the operator is choosing.
 */
export const CompositionClipPicker = ({
  open,
  media,
  status,
  onRetry,
  composition,
  returnFocusRef,
  onClose,
  onExited,
  onChoose,
}: {
  readonly open: boolean;
  /** Everything the Project holds, in the order it lists it. */
  readonly media: ProjectClipMediaCatalogue;
  /** Where the read behind `media` has got to, so an empty list can say why. */
  readonly status: ProjectClipMediaCatalogueStatus;
  /** Asks for the Project's media again after a failed read. */
  readonly onRetry: () => void;
  /** The arrangement as it stands, so a row can say it is already part of it. */
  readonly composition: Composition;
  readonly returnFocusRef: RefObject<HTMLElement | null>;
  readonly onClose: () => void;
  /** Once the panel has left and the surface behind it can be heard again. */
  readonly onExited?: (() => void) | undefined;
  readonly onChoose: (entry: ProjectClipMediaEntry) => void;
}) => {
  const theme = useTheme();
  const rowCss = rowStyles(theme);
  /*
   * Derived from the props, never captured on open — the catalogue may still be filling when the
   * panel is opened, and the rows must follow it — but memoised, because the surface above renders
   * on every frame of a slider drag and this list runs to the Project's source limit.
   */
  const clipsOver = useMemo(() => {
    const counts = new Map<string, number>();
    for (const clip of composition.clips) {
      const key = projectMediaReferenceKey(clip.media);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [composition.clips]);
  /*
   * Never the Project's own derived cut. Once a stitched arrangement is the current cut it is in
   * the catalogue like anything else, and adding it to the arrangement it came from would nest one
   * render inside the next.
   */
  const entries = useMemo(
    () => [...media.entries()].filter(([, entry]) => !entry.derived),
    [media],
  );

  /*
   * One arm per state, above the panel rather than as a ternary chain inside it — the shape the
   * arrangement surface next door already uses for its preview.
   */
  let body: ReactNode;
  if (entries.length > 0) {
    body = (
      <ul aria-label="Videos in this Project" css={videoRowListStyles(theme)}>
        {entries.map(([key, entry]) => {
          const held = clipsOver.get(key) ?? 0;
          const { filename, width, height, durationMs, hasAudio } = entry.media;
          return (
            <li key={key}>
              <Button variant="secondary" css={rowCss} onClick={() => onChoose(entry)}>
                <span>{filename}</span>
                <small>
                  {`${width}×${height} · ${formatVideoEditTimelineTime(durationMs)} · ${hasAudio ? 'with sound' : 'no sound'}`}
                </small>
                {held > 0 ? <small>{heldLabel(held)}</small> : null}
              </Button>
            </li>
          );
        })}
      </ul>
    );
  } else if (status === 'loading') {
    body = <p role="status">Loading videos…</p>;
  } else if (status === 'failed') {
    body = (
      <StatusNotice role="alert" tone="danger" title="Videos unavailable">
        <p>This Project’s videos could not be read from the local API.</p>
        <Button size="small" onClick={onRetry}>
          Retry
        </Button>
      </StatusNotice>
    );
  } else {
    body = (
      <StatusNotice tone="neutral" title="Nothing to add">
        This Project holds no video to add.
      </StatusNotice>
    );
  }

  return (
    <OverlayPanel
      open={open}
      onClose={onClose}
      title="Add a clip"
      description="Choose a video this Project holds. The whole of it becomes the last clip of the arrangement, and you can trim it there."
      placement="bottom"
      size="wide"
      bodyMode="scroll"
      returnFocusRef={returnFocusRef}
      onExited={onExited}
    >
      {body}
    </OverlayPanel>
  );
};
